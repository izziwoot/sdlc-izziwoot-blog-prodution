import type { BlogFrontmatter } from '@/content/schema';
import { TAGS } from '@/content/schema';

export type Tag = (typeof TAGS)[number];

/**
 * The shape every listing needs. Astro 7 content-layer entries are keyed by
 * `id` (derived from the filename by the glob loader) — there is no `slug`.
 */
export type PostLike = {
  id: string;
  data: Pick<BlogFrontmatter, 'pubDate' | 'draft' | 'tags' | 'retracted' | 'updatedDate'>;
};

export type SelectOpts = { now: Date; includeDrafts: boolean };

/** pubDate descending; id ascending as a deterministic tiebreak. */
function byRecencyThenId(a: PostLike, b: PostLike): number {
  const delta = b.data.pubDate.getTime() - a.data.pubDate.getTime();
  return delta !== 0 ? delta : a.id.localeCompare(b.id);
}

/**
 * Everything that gets a route: not a draft, not future-dated — unless
 * includeDrafts (dev and preview builds), where everything is visible.
 * Retracted posts ARE included: their URL must keep working (INV-5).
 */
export function selectPublished<T extends PostLike>(posts: T[], opts: SelectOpts): T[] {
  return posts
    .filter((p) => opts.includeDrafts || (!p.data.draft && p.data.pubDate <= opts.now))
    .slice()
    .sort(byRecencyThenId);
}

/** Everything that appears in a listing, the feed, or the sitemap. */
export function selectListable<T extends PostLike>(posts: T[], opts: SelectOpts): T[] {
  return selectPublished(posts, opts).filter((p) => !p.data.retracted);
}

/** Posts dated ahead of `now` — surfaced as a build warning, not an error. */
export function futureDated<T extends PostLike>(posts: T[], now: Date): T[] {
  return posts.filter((p) => p.data.pubDate > now);
}

export function groupByTag<T extends PostLike>(posts: T[]): Map<Tag, T[]> {
  const grouped = new Map<Tag, T[]>();
  for (const post of posts) {
    for (const tag of post.data.tags) {
      const bucket = grouped.get(tag);
      if (bucket) bucket.push(post);
      else grouped.set(tag, [post]);
    }
  }
  return grouped;
}

export function tagsWithCounts<T extends PostLike>(posts: T[]): { tag: Tag; count: number }[] {
  return [...groupByTag(posts).entries()]
    .map(([tag, list]) => ({ tag, count: list.length }))
    .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag));
}
