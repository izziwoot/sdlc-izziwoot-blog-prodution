import { defineConfig } from 'astro/config';
import remarkReadingTime from 'remark-reading-time';

export default defineConfig({
  site: process.env.SITE_URL ?? 'http://localhost:4321',
  output: 'static',
  trailingSlash: 'always',
  // Load-bearing: inlined <style> blocks would be blocked by the
  // style-src 'self' CSP added in Task 15.
  build: { inlineStylesheets: 'never' },
  markdown: {
    remarkPlugins: [remarkReadingTime],
    shikiConfig: {
      // Build-time highlighting in both schemes; no client-side highlighter.
      themes: { light: 'github-light', dark: 'github-dark' },
      wrap: false,
    },
  },
});
