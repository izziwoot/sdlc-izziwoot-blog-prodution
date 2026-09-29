import type { BlogFrontmatter } from '@/content/schema';

export type StatusInput = Pick<
  BlogFrontmatter,
  'pubDate' | 'updatedDate' | 'corrections' | 'retracted'
>;

export type PostStatus = {
  retracted: boolean;
  hasCorrections: boolean;
  showUpdated: boolean;
  /** Newest of pubDate, updatedDate, every correction, and the retraction. */
  latestChange: Date;
};

/**
 * Editorial state of a post, derived rather than stored. A published post is
 * never silently rewritten: corrections are appended and dated, and a retraction
 * keeps the URL alive (INV-5), so both are facts about the entry, not flags
 * someone remembers to set.
 */
export function postStatus(data: StatusInput): PostStatus {
  const candidates: Date[] = [data.pubDate];
  if (data.updatedDate) candidates.push(data.updatedDate);
  if (data.retracted) candidates.push(data.retracted.date);
  for (const c of data.corrections ?? []) candidates.push(c.date);

  const latestChange = candidates.reduce((a, b) => (b > a ? b : a), data.pubDate);

  return {
    retracted: data.retracted !== undefined,
    hasCorrections: (data.corrections ?? []).length > 0,
    showUpdated:
      data.updatedDate !== undefined && data.updatedDate.getTime() !== data.pubDate.getTime(),
    latestChange,
  };
}
