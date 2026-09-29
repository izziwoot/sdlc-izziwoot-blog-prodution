import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { beforeAll, describe, expect, it } from 'vitest';

/**
 * The only suite that shells out. Everything else in this project is a pure
 * function; these assertions exist because typechecking cannot tell you what
 * actually reached the HTML.
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
const read = (p: string) => readFileSync(new URL(`../dist/${p}`, import.meta.url), 'utf8');
const exists = (p: string) => existsSync(new URL(`../dist/${p}`, import.meta.url));

beforeAll(() => {
  execFileSync('pnpm', ['build'], { env: ENV, cwd: root, stdio: 'inherit' });
}, 300_000);

describe('post route output', () => {
  it('emits the post at its canonical trailing-slash path', () => {
    expect(exists(`blog/${SLUG}/index.html`)).toBe(true);
  });

  it('declares exactly one h1', () => {
    expect(read(`blog/${SLUG}/index.html`).match(/<h1[\s>]/g)).toHaveLength(1);
  });

  it('emits an absolute canonical link matching the route', () => {
    expect(read(`blog/${SLUG}/index.html`)).toContain(
      `<link rel="canonical" href="https://example.com/blog/${SLUG}/"`,
    );
  });

  it('gives body headings stable ids for deep linking', () => {
    const html = read(`blog/${SLUG}/index.html`);
    expect(html).toMatch(/<h2[^>]+id="the-pin-was-the-vulnerability"/);
    expect(html).toMatch(/class="heading-anchor"/);
  });

  it('highlights code at build time with no client-side highlighter', () => {
    const html = read(`blog/${SLUG}/index.html`);
    expect(html).toContain('class="astro-code');
    expect(html).not.toMatch(/prism|highlight\.js/i);
  });

  it('makes overflowing code blocks keyboard-scrollable', () => {
    expect(read(`blog/${SLUG}/index.html`)).toMatch(/<pre[^>]*tabindex="0"/);
  });

  it('emits BlogPosting JSON-LD with article timestamps', () => {
    const html = read(`blog/${SLUG}/index.html`);
    expect(html).toContain('"@type":"BlogPosting"');
    expect(html).toMatch(/property="article:published_time" content="20/);
  });

  it('gives external links noopener noreferrer and does NOT hijack navigation with target=_blank', () => {
    const html = read(`blog/${SLUG}/index.html`);
    const external = [...html.matchAll(/<a[^>]+href="https?:\/\/(?!example\.com)[^"]*"[^>]*>/g)].map(
      (m) => m[0],
    );
    expect(external.length).toBeGreaterThan(0);
    for (const anchor of external) {
      expect(anchor).toMatch(/rel="[^"]*noopener[^"]*"/);
      expect(anchor).toMatch(/rel="[^"]*noreferrer[^"]*"/);
      expect(anchor).not.toMatch(/target="_blank"/);
    }
  });

  it('omits retraction and corrections markup for a clean post', () => {
    const html = read(`blog/${SLUG}/index.html`);
    expect(html).not.toContain('class="retraction"');
    expect(html).not.toContain('class="corrections"');
  });
});

describe('invariants that must hold on every page', () => {
  const pages = ['index.html', `blog/${SLUG}/index.html`];

  it.each(pages)('%s ships no first-party JavaScript (INV-4)', (page) => {
    const srcs = [...read(page).matchAll(/<script[^>]*src="([^"]+)"/g)].map((m) => m[1]!);
    expect(srcs.filter((s) => s.startsWith('/'))).toEqual([]);
  });

  it.each(pages)('%s emits no <style> element, so style-src self holds for stylesheets', (page) => {
    expect(read(page)).not.toMatch(/<style[\s>]/);
  });

  it.each(pages)('%s links its stylesheet as a file', (page) => {
    expect(read(page)).toMatch(/<link rel="stylesheet" href="\/_astro\/[^"]+\.css"/);
  });

  it('records that Shiki emits inline style ATTRIBUTES, which style-src alone would block', () => {
    // Not a defect — a constraint Task 15's CSP must accommodate with
    // style-src-attr 'unsafe-inline'. If this ever reaches zero, revisit the CSP.
    const attrs = read(`blog/${SLUG}/index.html`).match(/style="[^"]*"/g) ?? [];
    expect(attrs.length).toBeGreaterThan(0);
  });
});
