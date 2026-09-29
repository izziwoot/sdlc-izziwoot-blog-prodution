import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkCsp, parseCsp, parseHeadersFile } from './lib/headers.mjs';

/**
 * Verifies the policy against the BUILT output, not the source. A CSP that
 * silently blocks the comments widget is worse than no comments, and a CSP that
 * quietly permits 'unsafe-inline' is worse than no CSP. Neither failure appears
 * in a build log.
 */
const DIST = fileURLToPath(new URL('../dist', import.meta.url));
const REQUIRED_FRAME = ['https://giscus.app'];
const problems = [];

let headersText = null;
try {
  headersText = readFileSync(join(DIST, '_headers'), 'utf8');
} catch {
  problems.push('dist/_headers is missing — Cloudflare would serve no security headers');
}

if (headersText) {
  const groups = parseHeadersFile(headersText);
  const csp = groups.get('/*')?.['Content-Security-Policy'];
  if (!csp) {
    problems.push('no Content-Security-Policy applied to /*');
  } else {
    problems.push(...checkCsp(parseCsp(csp), { requiredFrameOrigins: REQUIRED_FRAME }));
  }
}

function walk(dir) {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
}

for (const file of walk(DIST).filter((f) => f.endsWith('.html'))) {
  const html = readFileSync(file, 'utf8');
  const rel = file.slice(DIST.length);

  for (const [, attrs, body] of html.matchAll(/<script([^>]*)>([\s\S]*?)<\/script>/g)) {
    if (/\bsrc=/.test(attrs)) continue;
    // JSON-LD is data, not executable script; script-src does not cover it.
    if (/type="application\/ld\+json"/.test(attrs)) continue;
    if (body.trim() === '') continue;
    problems.push(`${rel}: inline <script> would be blocked by script-src`);
  }

  // <style> ELEMENTS are forbidden. Inline style ATTRIBUTES are expected —
  // Shiki emits them — and are covered by style-src-attr 'unsafe-inline'.
  if (/<style[\s>]/.test(html)) {
    problems.push(`${rel}: inline <style> element would be blocked by style-src 'self'`);
  }
}

if (problems.length > 0) {
  console.error('Header/CSP verification FAILED:\n');
  for (const p of problems) console.error(`  ${p}`);
  process.exit(1);
}
console.log('Header/CSP verification passed.');
