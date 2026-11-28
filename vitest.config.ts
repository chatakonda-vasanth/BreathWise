import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/unit/**/*.test.ts', 'tests/security/**/*.test.ts'],
    reporters: ['default'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary', 'html'],
      reportsDirectory: './coverage',
      // Scope: the deterministic server logic. React components are covered by
      // the Playwright suite instead, because jsdom cannot verify what actually
      // renders in a browser.
      include: ['src/lib/**/*.ts'],
      exclude: [
        // Type-only declarations: no executable code to cover.
        'src/lib/types.ts',
        // One-line `z.config({ jitless: true })` side effect, exercised by every
        // schema test but attributed to a module with no callable surface.
        'src/lib/zod-jitless.ts',
      ],
      // Locked to the measured totals after the split. A drop of more than a
      // fraction of a percent fails the build instead of silently eroding it.
      thresholds: {
        lines: 98,
        functions: 99,
        statements: 96,
        branches: 92,
      },
    },
  },
  resolve: {
    alias: {
      '@': new URL('./src', import.meta.url).pathname,
    },
  },
});
