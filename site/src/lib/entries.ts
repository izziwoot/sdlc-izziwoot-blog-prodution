import { getCollection, type CollectionEntry } from 'astro:content';
import { site } from '@/config/site';
import { selectListable, selectPublished } from '@/lib/posts';

/**
 * The only place getCollection('blog') is called. Duplicating the draft filter
 * across route files is how a draft eventually leaks into the feed.
 *
 * This module imports astro:content and therefore cannot be unit tested — which
 * is why it holds no logic. Everything decidable lives in posts.ts and
 * warnings.ts.
 */

export type BlogEntry = CollectionEntry<'blog'>;

function opts() {
  return { now: new Date(), includeDrafts: site.includeDrafts };
}

/** Every post that gets a route, retracted included — URLs must keep working (INV-5). */
export async function getPublishedPosts(): Promise<BlogEntry[]> {
  return selectPublished(await getCollection('blog'), opts());
}

/** Every post that appears in a listing, the feed, or the sitemap. */
export async function getListablePosts(): Promise<BlogEntry[]> {
  return selectListable(await getCollection('blog'), opts());
}

/** Unfiltered — for build-time warnings only. */
export async function getAllPosts(): Promise<BlogEntry[]> {
  return getCollection('blog');
}
