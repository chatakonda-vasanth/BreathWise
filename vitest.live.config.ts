import { defineConfig } from 'vitest/config';

/**
 * Live AI tests: real calls to the Gemini API through the real /api/plan
 * handler. Kept out of `npm test` (which must stay offline) and skipped
 * automatically when GEMINI_API_KEY is unset.
 */
export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/live/**/*.test.ts'],
    reporters: ['default'],
    testTimeout: 120_000,
    hookTimeout: 30_000,
    fileParallelism: false,
  },
  resolve: {
    alias: {
      '@': new URL('./src', import.meta.url).pathname,
    },
  },
});
