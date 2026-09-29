import { describe, expect, it } from 'vitest';
import { feedLastBuildDate, toFeedItems } from '@/lib/feed';

const ORIGIN = 'https://example.com';

const post = (over: {
  id?: string;
  title?: string;
  description?: string;
  pubDate?: Date;
  updatedDate?: Date;
}) => ({
  id: over.id ?? 'a',
  data: {
    title: over.title ?? 'A perfectly ordinary title',
    description: over.description ?? 'x'.repeat(80),
    pubDate: over.pubDate ?? new Date('2026-01-01'),
    updatedDate: over.updatedDate,
  },
});

describe('toFeedItems', () => {
  it('returns an empty array for no posts', () => {
    expect(toFeedItems([], ORIGIN)).toEqual([]);
  });

  it('uses an absolute link and an identical absolute guid', () => {
    const item = toFeedItems([post({ id: 'a-post' })], ORIGIN)[0]!;
    expect(item.link).toBe('https://example.com/blog/a-post/');
    expect(item.guid).toBe('https://example.com/blog/a-post/');
  });

  it('ships the description only, never the rendered body', () => {
    const item = toFeedItems([post({ description: 'y'.repeat(90) })], ORIGIN)[0]!;
    expect(item.description).toBe('y'.repeat(90));
    expect(item).not.toHaveProperty('content');
  });

  it('keeps the guid and pubDate stable when a post is corrected', () => {
    const before = toFeedItems([post({ id: 'a-post' })], ORIGIN)[0]!;
    const after = toFeedItems(
      [post({ id: 'a-post', updatedDate: new Date('2026-06-01') })],
      ORIGIN,
    )[0]!;
    // A changed guid makes every subscriber see the post as new again.
    expect(after.guid).toBe(before.guid);
    expect(after.pubDate).toEqual(before.pubDate);
  });

  it('preserves XML-unsafe characters verbatim for the serializer to escape', () => {
    const item = toFeedItems([post({ title: 'Tabs & spaces: a <holy> war' })], ORIGIN)[0]!;
    expect(item.title).toBe('Tabs & spaces: a <holy> war');
  });
});

describe('feedLastBuildDate', () => {
  const fallback = new Date('2026-09-29T00:00:00Z');

  it('falls back for an empty feed instead of producing an Invalid Date', () => {
    const result = feedLastBuildDate([], fallback);
    expect(result).toEqual(fallback);
    expect(Number.isNaN(result.getTime())).toBe(false);
  });

  it('uses the most recent updatedDate when one is newer than every pubDate', () => {
    const posts = [
      post({ id: 'a', pubDate: new Date('2026-01-01'), updatedDate: new Date('2026-07-01') }),
      post({ id: 'b', pubDate: new Date('2026-03-01') }),
    ];
    expect(feedLastBuildDate(posts, fallback)).toEqual(new Date('2026-07-01'));
  });

  it('uses the newest pubDate when no post has been updated', () => {
    const posts = [
      post({ id: 'a', pubDate: new Date('2026-01-01') }),
      post({ id: 'b', pubDate: new Date('2026-03-01') }),
    ];
    expect(feedLastBuildDate(posts, fallback)).toEqual(new Date('2026-03-01'));
  });

  it('does not use build wall-clock time, so an unchanged rebuild does not churn the feed', () => {
    const posts = [post({ id: 'a', pubDate: new Date('2026-01-01') })];
    expect(feedLastBuildDate(posts, fallback)).toEqual(new Date('2026-01-01'));
  });
});
