import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    // post-render and retraction both run `astro build` into the same dist/.
    // Run test files one at a time so neither reads output the other produced
    // from a different source state.
    fileParallelism: false,
  },
});
