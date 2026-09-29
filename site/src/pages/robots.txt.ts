import type { APIRoute } from 'astro';
import { site } from '@/config/site';

/**
 * Generated rather than a static file, so the sitemap URL comes from the
 * validated SITE_URL instead of a placeholder someone has to remember to replace.
 * Preview deployments emit a blanket disallow: a pages.dev URL competing with
 * production in the index is a real cost and an easy one to miss (spec §10.5).
 */
export const GET: APIRoute = () => {
  const body = site.noindex
    ? ['User-agent: *', 'Disallow: /', ''].join('\n')
    : ['User-agent: *', 'Allow: /', '', `Sitemap: ${site.url}/sitemap-index.xml`, ''].join('\n');

  return new Response(body, { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
};
