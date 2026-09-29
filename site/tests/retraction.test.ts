import { execFileSync } from 'node:child_process';
import {
  copyFileSync,
  existsSync,
  readFileSync,
  readdirSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * INV-5 is the invariant most expensive to break and the easiest to break by
 * accident: one listing switching from getListablePosts to getPublishedPosts and
 * a retracted post silently reappears in the feed.
 *
 * This suite temporarily adds retraction and correction front matter to a real
 * post, builds, asserts, and restores in afterAll. It is the only test that
 * mutates source, which is why it lives in its own file.
 */
const ENV = {
  ...process.env,
  SITE_URL: 'https://example.com',
  PUBLIC_GISCUS_REPO: 'izziwoot/x',
  PUBLIC_GISCUS_REPO_ID: 'R_x',
  PUBLIC_GISCUS_CATEGORY_ID: 'DIC_x',
};

const SLUG = 'version-pins-are-security-decisions';
const root = new URL('..', import.meta.url);
const postPath = new URL(`../src/content/blog/${SLUG}.md`, import.meta.url);
const postFile = fileURLToPath(postPath);
// Outside src/ so the content loader can never glob it and git can never see it.
const backupFile = join(tmpdir(), `izziwoot-${SLUG}.md.bak`);

const read = (p: string) => readFileSync(new URL(`../dist/${p}`, import.meta.url), 'utf8');
const build = () => execFileSync('pnpm', ['build'], { env: ENV, cwd: root, stdio: 'pipe' });

const RETRACTION = `updatedDate: 2026-09-30
corrections:
  - date: 2026-09-30
    note: A correction note long enough to satisfy the twenty character minimum.
retracted:
  date: 2026-10-01
  reason: A retraction reason long enough to satisfy the twenty character minimum.
tags:`;

beforeAll(() => {
  copyFileSync(postFile, backupFile);
  const original = readFileSync(postPath, 'utf8');
  writeFileSync(postPath, original.replace('tags:', RETRACTION));
  build();
}, 300_000);

afterAll(() => {
  // Restore before anything else can observe the mutated source. unlinkSync, not
  // a shelled-out rm: a URL pathname percent-encodes spaces in the repo path and
  // `rm -f` would silently delete nothing.
  if (existsSync(backupFile)) {
    copyFileSync(backupFile, postFile);
    unlinkSync(backupFile);
    // Rebuild, not just restore. Otherwise dist/ is left describing a retracted
    // post, and anything reading it afterwards — verify:output recording a size
    // baseline, a human inspecting the pages — sees a state that no longer
    // matches the source.
    build();
  }
});

describe('a retracted post', () => {
  it('keeps its URL working (INV-5)', () => {
    expect(existsSync(new URL(`../dist/blog/${SLUG}/index.html`, import.meta.url))).toBe(true);
  });

  it('renders a dated retraction notice with an accessible name', () => {
    const html = read(`blog/${SLUG}/index.html`);
    expect(html).toMatch(/class="retraction"[^>]*aria-label="Retraction notice"/);
    expect(html).toMatch(/Retracted on <time datetime="2026-10-01"/);
  });

  it('preserves the original body rather than replacing it', () => {
    expect(read(`blog/${SLUG}/index.html`)).toMatch(/The pin was the vulnerability/);
  });

  it('renders the corrections log after the body', () => {
    const html = read(`blog/${SLUG}/index.html`);
    expect(html).toContain('id="corrections-heading"');
    expect(html).toMatch(/twenty character minimum/);
  });

  it('shows an Updated line when updatedDate differs from pubDate', () => {
    expect(read(`blog/${SLUG}/index.html`)).toMatch(/Updated <time datetime="2026-09-30"/);
  });

  it.each(['index.html', 'feed.xml', 'sitemap-0.xml'])('disappears from %s', (page) => {
    expect(read(page)).not.toContain(SLUG);
  });

  it('leaves no tag page behind when its only post is retracted', () => {
    // groupByTag omits a tag with zero listable posts, so the page is never
    // generated at all — the correct outcome, not an oversight.
    expect(existsSync(new URL('../dist/blog/tags/security/', import.meta.url))).toBe(false);
  });

  it('is referenced by NO page in the whole build except its own', () => {
    const dist = fileURLToPath(new URL('../dist', import.meta.url));
    const walk = (dir: string): string[] =>
      readdirSync(dir).flatMap((entry) => {
        const full = join(dir, entry);
        return statSync(full).isDirectory() ? walk(full) : [full];
      });
    const offenders = walk(dist)
      .filter((f) => /\.(html|xml|txt)$/.test(f))
      .filter((f) => !f.includes(`blog/${SLUG}/`))
      .filter((f) => readFileSync(f, 'utf8').includes(SLUG))
      .map((f) => f.slice(dist.length));
    expect(offenders).toEqual([]);
  });
});
