import { readdirSync, readFileSync } from 'node:fs';
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';
import rehypeAutolinkHeadings from 'rehype-autolink-headings';
import rehypeExternalLinks from 'rehype-external-links';
import rehypeSlug from 'rehype-slug';
import remarkReadingTime from 'remark-reading-time';

/**
 * Make overflowing code blocks keyboard-scrollable (spec FR-9). Dependency-free
 * walk rather than pulling in unist-util-visit for four lines.
 */
function rehypePreTabindex() {
  const walk = (node) => {
    if (node.type === 'element' && node.tagName === 'pre') {
      node.properties = { ...node.properties, tabindex: '0' };
    }
    for (const child of node.children ?? []) walk(child);
  };
  return (tree) => walk(tree);
}

/**
 * Slugs of retracted posts, read straight from front matter. @astrojs/sitemap
 * cannot see front matter, so the exclusion list is computed at config time.
 * A retracted post keeps its URL (INV-5) but must not be advertised.
 */
function retractedSlugs() {
  const dir = new URL('./src/content/blog/', import.meta.url);
  let files = [];
  try {
    files = readdirSync(dir);
  } catch {
    return [];
  }
  return files
    .filter((f) => /\.mdx?$/.test(f))
    .filter((f) => /^retracted:/m.test(readFileSync(new URL(f, dir), 'utf8')))
    .map((f) => f.replace(/\.mdx?$/, ''));
}

const EXCLUDED = retractedSlugs();

export default defineConfig({
  site: process.env.SITE_URL ?? 'http://localhost:4321',
  output: 'static',
  trailingSlash: 'always',
  // Load-bearing: inlined <style> blocks would be blocked by the
  // style-src 'self' CSP added in Task 15.
  build: { inlineStylesheets: 'never' },
  integrations: [
    sitemap({
      filter: (page) =>
        !page.includes('/404') && !EXCLUDED.some((slug) => page.includes(`/blog/${slug}/`)),
    }),
  ],
  markdown: {
    remarkPlugins: [remarkReadingTime],
    rehypePlugins: [
      rehypeSlug,
      [
        rehypeAutolinkHeadings,
        {
          behavior: 'append',
          properties: { className: 'heading-anchor', ariaLabel: 'Permalink to this section' },
        },
      ],
      // No target="_blank": hijacking the reader's navigation choice is a
      // usability regression, not a feature (spec FR-13).
      [rehypeExternalLinks, { rel: ['noopener', 'noreferrer'] }],
      rehypePreTabindex,
    ],
    shikiConfig: {
      // Build-time highlighting in both schemes; no client-side highlighter.
      themes: { light: 'github-light', dark: 'github-dark' },
      wrap: false,
    },
  },
});
