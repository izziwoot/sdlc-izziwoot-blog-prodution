import { describe, expect, it } from 'vitest';
import { absoluteUrl, buildSeo } from '@/lib/seo';

const base = {
  origin: 'https://example.com',
  path: '/blog/a-post/',
  title: 'A post about retries',
  description: 'x'.repeat(80),
  type: 'article' as const,
  siteName: 'Izzi Woot',
};

const contentOf = (tags: ReturnType<typeof buildSeo>, key: string) =>
  tags.meta.find((m) => m.name === key || m.property === key)?.content;

describe('absoluteUrl', () => {
  it('joins an origin and a path without doubling the slash', () => {
    expect(absoluteUrl('/blog/a/', 'https://example.com')).toBe('https://example.com/blog/a/');
  });

  it('tolerates an origin that carries a trailing slash', () => {
    expect(absoluteUrl('/blog/a/', 'https://example.com/')).toBe('https://example.com/blog/a/');
  });

  it('tolerates a path missing its leading slash', () => {
    expect(absoluteUrl('blog/a/', 'https://example.com')).toBe('https://example.com/blog/a/');
  });

  it('passes an already-absolute URL through unchanged', () => {
    expect(absoluteUrl('https://other.test/x/', 'https://example.com')).toBe(
      'https://other.test/x/',
    );
  });
});

describe('buildSeo', () => {
  it('produces an absolute canonical URL', () => {
    expect(buildSeo(base).canonical).toBe('https://example.com/blog/a-post/');
  });

  it('honours a cross-post canonical override so we do not claim someone else’s canonical', () => {
    const tags = buildSeo({ ...base, canonicalOverride: 'https://elsewhere.test/a/' });
    expect(tags.canonical).toBe('https://elsewhere.test/a/');
  });

  it('emits an absolute og:url and og:image, never a relative one', () => {
    const tags = buildSeo({ ...base, image: '/og/default.png' });
    expect(contentOf(tags, 'og:url')).toBe('https://example.com/blog/a-post/');
    expect(contentOf(tags, 'og:image')).toBe('https://example.com/og/default.png');
  });

  it('sets og:type from the page kind', () => {
    expect(contentOf(buildSeo(base), 'og:type')).toBe('article');
    expect(contentOf(buildSeo({ ...base, type: 'website' }), 'og:type')).toBe('website');
  });

  it('emits article timestamps as ISO 8601 when supplied', () => {
    const tags = buildSeo({
      ...base,
      publishedTime: new Date('2026-03-12T00:00:00Z'),
      modifiedTime: new Date('2026-04-01T00:00:00Z'),
    });
    expect(contentOf(tags, 'article:published_time')).toBe('2026-03-12T00:00:00.000Z');
    expect(contentOf(tags, 'article:modified_time')).toBe('2026-04-01T00:00:00.000Z');
  });

  it('omits article timestamps entirely for a website page', () => {
    const tags = buildSeo({ ...base, type: 'website' });
    expect(contentOf(tags, 'article:published_time')).toBeUndefined();
  });

  it('emits BlogPosting JSON-LD for an article and none for a website', () => {
    const article = buildSeo({ ...base, publishedTime: new Date('2026-03-12T00:00:00Z') });
    expect(article.jsonLd?.['@type']).toBe('BlogPosting');
    expect(article.jsonLd?.['mainEntityOfPage']).toEqual({
      '@type': 'WebPage',
      '@id': 'https://example.com/blog/a-post/',
    });
    expect(buildSeo({ ...base, type: 'website' }).jsonLd).toBeNull();
  });

  it('adds a robots noindex tag when asked, for preview deployments', () => {
    expect(contentOf(buildSeo({ ...base, noindex: true }), 'robots')).toBe('noindex, nofollow');
    expect(contentOf(buildSeo(base), 'robots')).toBeUndefined();
  });

  it('suffixes the document title with the site name except on the home page', () => {
    expect(buildSeo(base).title).toBe('A post about retries — Izzi Woot');
    expect(buildSeo({ ...base, path: '/', title: 'Izzi Woot' }).title).toBe('Izzi Woot');
  });

  it('throws on an empty description rather than shipping a blank OG card', () => {
    expect(() => buildSeo({ ...base, description: '' })).toThrow(/description/);
  });
});
