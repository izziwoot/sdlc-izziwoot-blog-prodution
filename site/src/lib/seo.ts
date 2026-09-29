export type SeoInput = {
  origin: string;
  path: string;
  title: string;
  description: string;
  type: 'website' | 'article';
  siteName: string;
  image?: string;
  canonicalOverride?: string;
  publishedTime?: Date;
  modifiedTime?: Date;
  noindex?: boolean;
  author?: string;
};

export type MetaTag = { name?: string; property?: string; content: string };

export type SeoTags = {
  title: string;
  canonical: string;
  meta: MetaTag[];
  jsonLd: Record<string, unknown> | null;
};

export function absoluteUrl(path: string, origin: string): string {
  if (/^https?:\/\//.test(path)) return path;
  return `${origin.replace(/\/+$/, '')}/${path.replace(/^\/+/, '')}`;
}

/**
 * Builds every <head> metadata tag for a page. One place owns this: a page that
 * sets its own tags is how one route ends up with a stale og:url.
 */
export function buildSeo(input: SeoInput): SeoTags {
  if (!input.description.trim()) {
    throw new Error(`buildSeo: description is required for ${input.path}`);
  }

  const url = absoluteUrl(input.path, input.origin);
  const canonical = input.canonicalOverride ?? url;
  const image = absoluteUrl(input.image ?? '/og-default.png', input.origin);
  const isHome = input.path === '/';

  const meta: MetaTag[] = [
    { name: 'description', content: input.description },
    { property: 'og:title', content: input.title },
    { property: 'og:description', content: input.description },
    { property: 'og:url', content: url },
    { property: 'og:type', content: input.type },
    { property: 'og:site_name', content: input.siteName },
    { property: 'og:image', content: image },
    { name: 'twitter:card', content: 'summary_large_image' },
    { name: 'twitter:title', content: input.title },
    { name: 'twitter:description', content: input.description },
    { name: 'twitter:image', content: image },
  ];

  if (input.noindex) meta.push({ name: 'robots', content: 'noindex, nofollow' });

  if (input.type === 'article') {
    if (input.publishedTime) {
      meta.push({ property: 'article:published_time', content: input.publishedTime.toISOString() });
    }
    if (input.modifiedTime) {
      meta.push({ property: 'article:modified_time', content: input.modifiedTime.toISOString() });
    }
  }

  const jsonLd =
    input.type === 'article'
      ? {
          '@context': 'https://schema.org',
          '@type': 'BlogPosting',
          headline: input.title,
          description: input.description,
          image,
          datePublished: input.publishedTime?.toISOString(),
          dateModified: (input.modifiedTime ?? input.publishedTime)?.toISOString(),
          author: { '@type': 'Person', name: input.author ?? 'Adilson Cesar' },
          publisher: { '@type': 'Organization', name: input.siteName },
          mainEntityOfPage: { '@type': 'WebPage', '@id': url },
        }
      : null;

  return {
    title: isHome ? input.title : `${input.title} — ${input.siteName}`,
    canonical,
    meta,
    jsonLd,
  };
}
