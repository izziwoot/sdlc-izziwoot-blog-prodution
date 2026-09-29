import { absoluteUrl } from '@/lib/seo';

type FeedSource = {
  id: string;
  data: { title: string; description: string; pubDate: Date; updatedDate?: Date };
};

export type FeedItem = {
  title: string;
  link: string;
  guid: string;
  pubDate: Date;
  description: string;
};

/**
 * Maps posts to feed items. Values are kept verbatim — XML escaping belongs to
 * the serializer, and doing it here would double-escape.
 *
 * Description only, never the rendered body: a full-content feed has to sanitize
 * embedded HTML for every consumer, and the description is plain text that cannot
 * carry an injection payload. A deliberate convenience-for-safety trade.
 */
export function toFeedItems(posts: FeedSource[], origin: string): FeedItem[] {
  return posts.map((post) => {
    const url = absoluteUrl(`/blog/${post.id}/`, origin);
    return {
      title: post.data.title,
      link: url,
      // Stable across corrections. A changed guid re-surfaces the post as new
      // for every subscriber at once.
      guid: url,
      pubDate: post.data.pubDate,
      description: post.data.description,
    };
  });
}

/**
 * The newest content change, never build wall-clock time — otherwise every
 * deploy churns the feed. An empty feed returns the fallback rather than a
 * reduce over nothing, which would yield an Invalid Date.
 */
export function feedLastBuildDate(posts: FeedSource[], fallback: Date): Date {
  let latest: Date | null = null;
  for (const post of posts) {
    const candidate = post.data.updatedDate ?? post.data.pubDate;
    if (latest === null || candidate > latest) latest = candidate;
  }
  return latest ?? fallback;
}
