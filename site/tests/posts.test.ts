import { describe, expect, it } from 'vitest';
import {
  futureDated,
  groupByTag,
  selectListable,
  selectPublished,
  tagsWithCounts,
  type PostLike,
} from '@/lib/posts';

const NOW = new Date('2026-09-28T00:00:00Z');

const post = (over: Partial<PostLike['data']> & { id: string }): PostLike => {
  const { id, ...data } = over;
  // Astro 7's glob loader derives `id` from the filename, without extension.
  return {
    id,
    data: { pubDate: new Date('2026-01-01'), draft: false, tags: ['ai'], ...data },
  };
};

describe('selectPublished', () => {
  it('returns an empty array for an empty input rather than throwing', () => {
    expect(selectPublished([], { now: NOW, includeDrafts: false })).toEqual([]);
  });

  it('excludes drafts in production mode', () => {
    const posts = [post({ id: 'a' }), post({ id: 'b', draft: true })];
    expect(selectPublished(posts, { now: NOW, includeDrafts: false }).map((p) => p.id)).toEqual([
      'a',
    ]);
  });

  it('includes drafts when includeDrafts is set, for dev and preview builds', () => {
    const posts = [post({ id: 'a' }), post({ id: 'b', draft: true })];
    expect(selectPublished(posts, { now: NOW, includeDrafts: true })).toHaveLength(2);
  });

  it('excludes a future-dated post from production output', () => {
    const posts = [post({ id: 'future', pubDate: new Date('2026-12-25') })];
    expect(selectPublished(posts, { now: NOW, includeDrafts: false })).toEqual([]);
  });

  it('includes a future-dated post when drafts are included', () => {
    const posts = [post({ id: 'future', pubDate: new Date('2026-12-25') })];
    expect(selectPublished(posts, { now: NOW, includeDrafts: true })).toHaveLength(1);
  });

  it('treats a post dated exactly now as published', () => {
    const posts = [post({ id: 'boundary', pubDate: NOW })];
    expect(selectPublished(posts, { now: NOW, includeDrafts: false })).toHaveLength(1);
  });

  it('orders by pubDate descending', () => {
    const posts = [
      post({ id: 'old', pubDate: new Date('2026-01-01') }),
      post({ id: 'new', pubDate: new Date('2026-06-01') }),
    ];
    expect(selectPublished(posts, { now: NOW, includeDrafts: false }).map((p) => p.id)).toEqual([
      'new',
      'old',
    ]);
  });

  it('breaks a pubDate tie by id ascending, so ordering is deterministic across machines', () => {
    const same = new Date('2026-05-05');
    const posts = [post({ id: 'zebra', pubDate: same }), post({ id: 'alpha', pubDate: same })];
    const ordered = selectPublished(posts, { now: NOW, includeDrafts: false }).map((p) => p.id);
    expect(ordered).toEqual(['alpha', 'zebra']);
    // Running it on reversed input must not change the answer.
    expect(
      selectPublished([...posts].reverse(), { now: NOW, includeDrafts: false }).map((p) => p.id),
    ).toEqual(['alpha', 'zebra']);
  });

  it('does not mutate the input array', () => {
    const posts = [
      post({ id: 'b', pubDate: new Date('2026-01-01') }),
      post({ id: 'a', pubDate: new Date('2026-02-01') }),
    ];
    const before = posts.map((p) => p.id);
    selectPublished(posts, { now: NOW, includeDrafts: false });
    expect(posts.map((p) => p.id)).toEqual(before);
  });
});

describe('selectListable', () => {
  it('excludes retracted posts from listings while selectPublished still yields them for routing', () => {
    const posts = [
      post({ id: 'ok' }),
      post({ id: 'gone', retracted: { date: NOW, reason: 'x'.repeat(20) } }),
    ];
    expect(selectListable(posts, { now: NOW, includeDrafts: false }).map((p) => p.id)).toEqual([
      'ok',
    ]);
    expect(selectPublished(posts, { now: NOW, includeDrafts: false })).toHaveLength(2);
  });
});

describe('futureDated', () => {
  it('reports future-dated posts so the build can warn about them', () => {
    const posts = [post({ id: 'now' }), post({ id: 'later', pubDate: new Date('2027-01-01') })];
    expect(futureDated(posts, NOW).map((p) => p.id)).toEqual(['later']);
  });
});

describe('groupByTag', () => {
  it('returns an empty map for no posts', () => {
    expect(groupByTag([]).size).toBe(0);
  });

  it('omits tags with no posts entirely, so no empty tag page is generated', () => {
    const grouped = groupByTag([post({ id: 'a', tags: ['ai'] })]);
    expect([...grouped.keys()]).toEqual(['ai']);
    expect(grouped.has('devops')).toBe(false);
  });

  it('places a multi-tagged post under each of its tags', () => {
    const grouped = groupByTag([post({ id: 'a', tags: ['ai', 'security'] })]);
    expect(grouped.get('ai')?.[0]?.id).toBe('a');
    expect(grouped.get('security')?.[0]?.id).toBe('a');
  });

  it('preserves the incoming order within each tag group', () => {
    const grouped = groupByTag([
      post({ id: 'newer', pubDate: new Date('2026-06-01'), tags: ['ai'] }),
      post({ id: 'older', pubDate: new Date('2026-01-01'), tags: ['ai'] }),
    ]);
    expect(grouped.get('ai')?.map((p) => p.id)).toEqual(['newer', 'older']);
  });
});

describe('tagsWithCounts', () => {
  it('sorts by count descending, then tag name ascending for a stable list', () => {
    const posts = [
      post({ id: 'a', tags: ['ai'] }),
      post({ id: 'b', tags: ['ai'] }),
      post({ id: 'c', tags: ['security'] }),
      post({ id: 'd', tags: ['devops'] }),
    ];
    expect(tagsWithCounts(posts)).toEqual([
      { tag: 'ai', count: 2 },
      { tag: 'devops', count: 1 },
      { tag: 'security', count: 1 },
    ]);
  });
});
