import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { blogSchema, RESERVED_SLUGS, TAGS } from '@/content/schema';

const image = () => z.string();
const schema = blogSchema({ image });

const base = {
  title: 'Choosing boring tools on purpose',
  description:
    'Why the least exciting option in a technology decision is usually the one that survives contact with production, and how to tell the difference.',
  pubDate: '2026-09-01',
  tags: ['architecture'],
};

describe('blogSchema', () => {
  it('accepts a minimal valid post and defaults draft to false', () => {
    const parsed = schema.parse(base);
    expect(parsed.draft).toBe(false);
    expect(parsed.pubDate).toBeInstanceOf(Date);
  });

  it('rejects a title shorter than 10 or longer than 70 characters', () => {
    expect(() => schema.parse({ ...base, title: 'Too short' })).toThrow();
    expect(() => schema.parse({ ...base, title: 'x'.repeat(71) })).toThrow();
  });

  it('rejects a description outside 70-160 characters', () => {
    expect(() => schema.parse({ ...base, description: 'x'.repeat(69) })).toThrow();
    expect(() => schema.parse({ ...base, description: 'x'.repeat(161) })).toThrow();
  });

  it('requires at least one tag and allows at most four', () => {
    expect(() => schema.parse({ ...base, tags: [] })).toThrow();
    expect(() => schema.parse({ ...base, tags: TAGS.slice(0, 5) })).toThrow();
  });

  it('rejects a tag outside the closed vocabulary', () => {
    expect(() => schema.parse({ ...base, tags: ['blockchain'] })).toThrow();
  });

  it('rejects duplicate tags', () => {
    expect(() => schema.parse({ ...base, tags: ['ai', 'ai'] })).toThrow(/unique/);
  });

  it('rejects unknown front-matter keys so a typo cannot pass silently', () => {
    expect(() => schema.parse({ ...base, publishDate: '2026-09-01' })).toThrow();
  });

  it('rejects a slug key - the filename is the only slug source', () => {
    expect(() => schema.parse({ ...base, slug: 'custom' })).toThrow();
  });

  it('rejects updatedDate earlier than pubDate', () => {
    expect(() => schema.parse({ ...base, updatedDate: '2026-08-01' })).toThrow(/updatedDate/);
  });

  it('accepts updatedDate equal to pubDate', () => {
    expect(() => schema.parse({ ...base, updatedDate: '2026-09-01' })).not.toThrow();
  });

  it('requires meaningful alt text when a cover image is present', () => {
    expect(() => schema.parse({ ...base, cover: { src: './a.png', alt: 'img' } })).toThrow(/alt/);
    expect(() =>
      schema.parse({
        ...base,
        cover: { src: './a.png', alt: 'A whiteboard sketch of the retry loop' },
      }),
    ).not.toThrow();
  });

  it('cannot express a cover image without alt text at all', () => {
    expect(() => schema.parse({ ...base, cover: { src: './a.png' } })).toThrow();
  });

  it('accepts an append-only corrections log with substantive notes', () => {
    const parsed = schema.parse({
      ...base,
      corrections: [{ date: '2026-09-10', note: 'The benchmark figure was wrong by 10x.' }],
    });
    expect(parsed.corrections).toHaveLength(1);
  });

  it('rejects a correction note too short to explain anything', () => {
    expect(() =>
      schema.parse({ ...base, corrections: [{ date: '2026-09-10', note: 'oops' }] }),
    ).toThrow();
  });

  it('accepts a retraction with a date and a reason', () => {
    const parsed = schema.parse({
      ...base,
      retracted: { date: '2026-09-20', reason: 'The central claim does not replicate.' },
    });
    expect(parsed.retracted?.reason).toMatch(/replicate/);
  });
});

describe('vocabulary invariants', () => {
  it('exposes tags as lowercase kebab-case', () => {
    for (const tag of TAGS) expect(tag).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
  });

  it('reserves every top-level segment used under /blog/', () => {
    expect(RESERVED_SLUGS).toContain('tags');
  });

  it('never reserves a name that is also a tag, which would be contradictory', () => {
    for (const reserved of RESERVED_SLUGS) {
      expect(TAGS).not.toContain(reserved as (typeof TAGS)[number]);
    }
  });
});
