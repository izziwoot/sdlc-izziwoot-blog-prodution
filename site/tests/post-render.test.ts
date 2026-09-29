import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { readdirSync } from 'node:fs';
import { beforeAll, describe, expect, it } from 'vitest';
import { TAGS } from '@/content/schema';

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

describe('tag routes', () => {
  /** Tags carried by the only published post. */
  const USED = ['security', 'tooling'] as const;

  it('emits the tag index', () => {
    expect(exists('blog/tags/index.html')).toBe(true);
  });

  it.each(USED)('emits a page for %s, which has a published post', (tag) => {
    expect(exists(`blog/tags/${tag}/index.html`)).toBe(true);
  });

  it('emits NO directory for a tag with zero published posts (FR-16)', () => {
    const emitted = readdirSync(new URL('../dist/blog/tags/', import.meta.url), {
      withFileTypes: true,
    })
      .filter((e) => e.isDirectory())
      .map((e) => e.name);
    const unused = TAGS.filter((t) => !USED.includes(t as (typeof USED)[number]));
    expect(unused.length).toBeGreaterThan(0);
    for (const tag of unused) expect(emitted).not.toContain(tag);
  });

  it('links each tag from the index to its own page', () => {
    const html = read('blog/tags/index.html');
    for (const tag of USED) expect(html).toContain(`href="/blog/tags/${tag}/"`);
  });

  it('lists the post on its tag page', () => {
    expect(read(`blog/tags/security/index.html`)).toContain(`href="/blog/${SLUG}/"`);
  });

  it('agrees the singular for a one-post tag rather than saying "1 posts"', () => {
    expect(read('blog/tags/index.html')).toMatch(/1 post\b/);
    expect(read('blog/tags/index.html')).not.toMatch(/1 posts/);
  });

  it('offers a route back to all topics', () => {
    expect(read('blog/tags/security/index.html')).toContain('href="/blog/tags/"');
  });
});

describe('feed output', () => {
  it('emits feed.xml', () => {
    expect(exists('feed.xml')).toBe(true);
  });

  it('parses as well-formed XML', async () => {
    const { XMLValidator } = await import('fast-xml-parser');
    expect(XMLValidator.validate(read('feed.xml'))).toBe(true);
  });

  it('uses absolute links and an identical absolute permalink guid', () => {
    const xml = read('feed.xml');
    expect(xml).toContain(`<link>https://example.com/blog/${SLUG}/</link>`);
    expect(xml).toContain(
      `<guid isPermaLink="true">https://example.com/blog/${SLUG}/</guid>`,
    );
  });

  it('declares a language and an atom self link', () => {
    const xml = read('feed.xml');
    expect(xml).toContain('<language>en</language>');
    expect(xml).toMatch(/<atom:link href="https:\/\/example\.com\/feed\.xml" rel="self"/);
  });

  it('ships no rendered post body, so no consumer has HTML to sanitize', () => {
    const xml = read('feed.xml');
    expect(xml).not.toContain('<content:encoded');
    expect(xml).toContain('<description>');
  });

  it('derives lastBuildDate from content, not from build wall-clock time', () => {
    const xml = read('feed.xml');
    const lastBuild = xml.match(/<lastBuildDate>([^<]+)<\/lastBuildDate>/)?.[1];
    const pubDate = xml.match(/<pubDate>([^<]+)<\/pubDate>/)?.[1];
    expect(lastBuild).toBeDefined();
    // Only one post exists, so these must agree. If lastBuildDate were "now",
    // every deploy would churn the feed for every subscriber.
    expect(lastBuild).toBe(pubDate);
  });

  it('escapes XML-unsafe characters rather than emitting them raw', () => {
    const xml = read('feed.xml');
    // No bare ampersand anywhere: every & must begin an entity.
    const bare = [...xml.matchAll(/&(?!amp;|lt;|gt;|quot;|apos;|#\d+;|#x[0-9a-fA-F]+;)/g)];
    expect(bare).toEqual([]);
  });
});

describe('static pages', () => {
  it.each([
    ['about/index.html', 'About'],
    ['privacy/index.html', 'Privacy'],
    ['404.html', 'Page not found'],
  ])('emits %s', (page, heading) => {
    expect(exists(page)).toBe(true);
    expect(read(page)).toContain(heading);
  });

  it('states the AI-assistance commitment in its load-bearing form', () => {
    const html = read('about/index.html');
    expect(html).toMatch(/executed before it is published/);
    expect(html).toMatch(/primary source/);
  });

  it('does NOT claim a publishing cadence that has not been decided (FR-21)', () => {
    // Open Question 5 is unanswered; an implementer must not invent a promise.
    expect(read('about/index.html')).not.toMatch(/every month|monthly|weekly|each week/i);
  });

  it('documents the corrections and retraction policy', () => {
    const html = read('about/index.html');
    expect(html).toMatch(/not silently rewritten/);
    expect(html).toMatch(/keep their URL/);
  });

  it('names both processors and says IP addresses are processed', () => {
    const html = read('privacy/index.html');
    expect(html).toContain('Cloudflare');
    expect(html).toContain('GitHub');
    expect(html).toMatch(/IP address/);
  });

  it('does not overclaim that nothing at all is collected (spec §10.4)', () => {
    // The honest claim is "no cookies, no personal data stored" — not "nothing
    // collected", since our CDN and comment host both process IP addresses.
    expect(read('privacy/index.html')).not.toMatch(/nothing (is )?collected/i);
  });

  it('explains why there is no cookie banner', () => {
    expect(read('privacy/index.html')).toMatch(/no cookies to consent to/i);
  });

  it('renders icons as inline SVG with no icon-font request', () => {
    const html = read('about/index.html');
    expect(html).toContain('<svg');
    expect(html).not.toMatch(/fontawesome|font-awesome|\bfa-/i);
  });

  it('marks decorative icons aria-hidden so they are not announced', () => {
    expect(read('about/index.html')).toMatch(/<svg[^>]*aria-hidden="true"/);
  });

  it('keeps the 404 page free of a noindex-defeating canonical to a real page', () => {
    expect(read('404.html')).toContain('Page not found');
  });
});

describe('discovery', () => {
  it('emits a sitemap index and a sitemap', () => {
    expect(exists('sitemap-index.xml')).toBe(true);
    expect(exists('sitemap-0.xml')).toBe(true);
  });

  it('lists every real page in the sitemap', () => {
    const xml = read('sitemap-0.xml');
    for (const loc of [
      'https://example.com/',
      `https://example.com/blog/${SLUG}/`,
      'https://example.com/blog/tags/',
      'https://example.com/blog/tags/security/',
      'https://example.com/about/',
      'https://example.com/privacy/',
    ]) {
      expect(xml).toContain(`<loc>${loc}</loc>`);
    }
  });

  it('excludes the 404 page from the sitemap', () => {
    expect(read('sitemap-0.xml')).not.toContain('/404');
  });

  it('generates robots.txt from the validated SITE_URL, not a placeholder', () => {
    const txt = read('robots.txt');
    expect(txt).toMatch(/^User-agent: \*/m);
    expect(txt).toMatch(/^Allow: \/$/m);
    expect(txt).toContain('Sitemap: https://example.com/sitemap-index.xml');
    expect(txt).not.toMatch(/REPLACE|TODO|example\.test/i);
  });

  it('ships _redirects with the canonical 301s', () => {
    const txt = read('_redirects');
    for (const line of [/^\/blog\s+\/\s+301/m, /^\/tags\/\*\s+\/blog\/tags\/:splat\s+301/m, /^\/feed\s+\/feed\.xml\s+301/m, /^\/rss\.xml\s+\/feed\.xml\s+301/m]) {
      expect(txt).toMatch(line);
    }
  });
});

describe('invariants that must hold on every page', () => {
  const pages = [
    'index.html',
    `blog/${SLUG}/index.html`,
    'blog/tags/index.html',
    'blog/tags/security/index.html',
    'about/index.html',
    'privacy/index.html',
    '404.html',
  ];

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
