import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Governance documents carry machine-checkable front matter. Two things matter
 * beyond presence:
 *
 * - The `publication` sentinel. Without it the build-output leak check has
 *   nothing to grep for, so a document could leak and Task 16's guard would
 *   silently not cover it.
 * - `next-review`. An annual review that nothing enforces does not happen, so an
 *   overdue date FAILS rather than warns.
 *
 * templates/ is excluded on purpose: a template holds YYYY-MM-DD placeholders by
 * definition and is not itself a policy.
 */
const ROOT = fileURLToPath(new URL('..', import.meta.url));
const DIRS = ['policies', 'frameworks', 'audits'];
const REQUIRED = ['id', 'owner', 'version', 'last-reviewed', 'next-review', 'publication'];
const SENTINEL = 'IZZIWOOT-GOVERNANCE-DO-NOT-PUBLISH';

/** @type {string[]} */
const problems = [];

/** @param {string} dir @returns {string[]} */
function walk(dir) {
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return [];
  }
  return entries.flatMap((entry) => {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) return walk(path);
    return path.endsWith('.md') ? [path] : [];
  });
}

const today = new Date();
let scanned = 0;

for (const dir of DIRS) {
  for (const file of walk(join(ROOT, dir))) {
    scanned += 1;
    const rel = file.slice(ROOT.length);
    const text = readFileSync(file, 'utf8');
    const match = text.match(/^---\n([\s\S]*?)\n---/);

    if (!match) {
      problems.push(`${rel}: missing YAML front matter`);
      continue;
    }

    const front = match[1] ?? '';

    for (const key of REQUIRED) {
      if (!new RegExp(`^${key}:`, 'm').test(front)) problems.push(`${rel}: missing "${key}"`);
    }

    if (!front.includes(SENTINEL)) {
      problems.push(
        `${rel}: publication sentinel absent — the build-output leak check cannot detect this file`,
      );
    }

    const next = front.match(/^next-review:\s*(\S+)/m)?.[1];
    if (next && !/^\d{4}-\d{2}-\d{2}$/.test(next)) {
      problems.push(`${rel}: next-review must be an ISO date (YYYY-MM-DD), got "${next}"`);
    } else if (next && new Date(next) < today) {
      problems.push(`${rel}: next-review ${next} has passed — review the document`);
    }
  }
}

if (problems.length > 0) {
  console.error('Governance front-matter check FAILED:\n');
  for (const p of problems) console.error(`  ${p}`);
  console.error(`\n${problems.length} problem(s) across ${scanned} document(s).`);
  process.exit(1);
}
console.log(`Governance front-matter check passed (${scanned} document(s)).`);
