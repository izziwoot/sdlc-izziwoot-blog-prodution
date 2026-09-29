import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SENTINEL, findLeaks } from './lib/leaks.mjs';

const DIST = fileURLToPath(new URL('../dist', import.meta.url));
const BASELINE = fileURLToPath(new URL('../.output-baseline.json', import.meta.url));
const TEXTUAL = /\.(html|xml|txt|json|css|js|mjs|svg|md)$/;

const FORBIDDEN_PATHS = ['policies', 'frameworks', 'audits', 'templates', 'intent', 'spec', 'plan'];
const FORBIDDEN_EXTENSIONS = ['.env', '.pem', '.key', '.sqlite'];

/** @param {string} dir @returns {string[]} */
function walk(dir) {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
}

const all = walk(DIST);

const files = all.map((path) => ({
  path: `/${path.slice(DIST.length).replace(/^\//, '')}`,
  content: TEXTUAL.test(path) ? readFileSync(path, 'utf8') : '',
}));

const current = {
  count: all.length,
  bytes: all.reduce((sum, p) => sum + statSync(p).size, 0),
};

/** @type {{count:number,bytes:number}|null} */
let baseline = null;
if (existsSync(BASELINE)) {
  try {
    baseline = JSON.parse(readFileSync(BASELINE, 'utf8'));
  } catch {
    baseline = null; // a corrupt baseline must not mask a leak
  }
}

const problems = findLeaks({
  files,
  sentinel: SENTINEL,
  forbiddenPaths: FORBIDDEN_PATHS,
  forbiddenExtensions: FORBIDDEN_EXTENSIONS,
  current,
  baseline,
});

if (problems.length > 0) {
  console.error('Output leak check FAILED:\n');
  for (const p of problems) console.error(`  ${p.path} [${p.kind}] ${p.message}`);
  console.error(`\n${problems.length} problem(s). Nothing outside site/ may be published.`);
  process.exit(1);
}

writeFileSync(BASELINE, `${JSON.stringify(current, null, 2)}\n`);
console.log(`Output leak check passed (${current.count} files, ${current.bytes} bytes).`);
