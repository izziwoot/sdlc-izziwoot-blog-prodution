import rss from '@astrojs/rss';
import type { APIRoute } from 'astro';
import { site } from '@/config/site';
import { getListablePosts } from '@/lib/entries';
import { feedLastBuildDate, toFeedItems } from '@/lib/feed';

export const GET: APIRoute = async () => {
  const posts = await getListablePosts();
  const items = toFeedItems(posts, site.url);

  // An empty feed uses the epoch rather than build time, so a feed with no
  // content does not appear to change on every deploy.
  const lastBuild = feedLastBuildDate(posts, new Date(0));

  return rss({
    title: site.name,
    description: site.tagline,
    site: site.url,
    // @astrojs/rss escapes every field it owns; toFeedItems keeps values verbatim
    // so nothing is escaped twice.
    items: items.map((item) => ({
      title: item.title,
      link: item.link,
      pubDate: item.pubDate,
      description: item.description,
      // Slugs are kebab-case (enforced by scripts/check-filenames.mjs), so this
      // URL contains no characters needing escaping.
      customData: `<guid isPermaLink="true">${item.guid}</guid>`,
    })),
    // Declares the atom namespace so the self link below validates (spec §4.4).
    xmlns: { atom: 'http://www.w3.org/2005/Atom' },
    customData: [
      '<language>en</language>',
      `<atom:link href="${site.url}/feed.xml" rel="self" type="application/rss+xml"/>`,
      `<lastBuildDate>${lastBuild.toUTCString()}</lastBuildDate>`,
    ].join(''),
  });
};
