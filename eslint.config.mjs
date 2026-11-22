import { defineConfig, globalIgnores } from 'eslint/config';
import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTs from 'eslint-config-next/typescript';
// Registered explicitly (same plugin object eslint-config-next uses) so the
// security rule below resolves for every linted file, including ones the
// Next preset's own `files` glob does not cover.
import react from 'eslint-plugin-react';

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    plugins: { react },
    rules: {
      // Security invariant: never render untrusted HTML.
      'react/no-danger': 'error',
      'no-eval': 'error',
      'no-implied-eval': 'error',
      'no-new-func': 'error',
    },
  },
  globalIgnores([
    '.next/**',
    // Generated deployment output (gitignored): never lint bundles.
    '.open-next/**',
    '.wrangler/**',
    'freebuff-sites-build/**',
    'freebuff.open-next.config.ts',
    'freebuff.wrangler.jsonc',
    'node_modules/**',
    'coverage/**',
    'playwright-report/**',
    'test-results/**',
    'public/sw.js',
  ]),
]);
