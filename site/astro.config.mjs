import { defineConfig } from 'astro/config';

export default defineConfig({
  site: process.env.SITE_URL ?? 'http://localhost:4321',
  output: 'static',
  trailingSlash: 'always',
  // Load-bearing: inlined <style> blocks would be blocked by the
  // style-src 'self' CSP added in Task 15.
  build: { inlineStylesheets: 'never' },
});
