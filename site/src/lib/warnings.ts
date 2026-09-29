import { futureDated, type PostLike } from '@/lib/posts';

/**
 * Build-time warnings. Pure on purpose: this module imports nothing from
 * astro:content, which is a virtual module Vitest cannot resolve, so every rule
 * here is directly unit-testable. The Astro-coupled data access lives in
 * entries.ts, which has no logic worth testing.
 */

/** Above this, an unpaginated index stops being honest (spec FR-4a). */
export const POST_LIMIT_WARNING = 60;

export function warnAboutFutureDated(
  posts: PostLike[],
  now: Date,
  log: (msg: string) => void = console.warn,
): void {
  const future = futureDated(posts, now);
  if (future.length === 0) return;
  log(
    `[content] ${future.length} post(s) dated in the future and excluded from ` +
      `production: ${future.map((p) => p.id).join(', ')}`,
  );
}

export function warnAboutVolume(
  count: number,
  log: (msg: string) => void = console.warn,
): void {
  if (count < POST_LIMIT_WARNING) return;
  log(
    `[content] ${count} published posts on a single unpaginated index — ` +
      `introduce pagination deliberately (spec FR-4a).`,
  );
}
