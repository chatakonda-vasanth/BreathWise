import { defineConfig, globalIgnores } from 'eslint/config';
import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTs from 'eslint-config-next/typescript';
// Registered explicitly (same plugin object eslint-config-next uses) so the
// security rule below resolves for every linted file, including ones the
// Next preset's own `files` glob does not cover.
import react from 'eslint-plugin-react';
import tseslint from 'typescript-eslint';

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
  {
    // Production code: type-aware rules plus size limits.
    files: ['src/**/*.ts', 'src/**/*.tsx'],
    extends: [...tseslint.configs.recommendedTypeChecked],
    languageOptions: {
      parserOptions: {
        // Type-aware rules (floating promises, misused promises) need the type
        // checker. The project service picks up the right tsconfig per file.
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      // A dropped promise is a silently swallowed failure: a plan request that
      // never resolves, a rate-limit write that never lands.
      '@typescript-eslint/no-floating-promises': 'error',
      // `async () => {}` passed to `onClick` returns a promise nobody awaits.
      '@typescript-eslint/no-misused-promises': ['error', { checksVoidReturn: false }],
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-non-null-assertion': 'error',
      // Keep functions reviewable: past this size, split by responsibility.
      complexity: ['error', 15],
      'max-depth': ['error', 4],
      'max-params': ['error', 5],
    },
  },
  {
    // Tests: the syntax-level rules still apply, but type-aware checks add noise
    // (a mock is intentionally loosely typed) without guarding production code.
    files: ['tests/**/*.ts'],
    extends: [...tseslint.configs.recommended],
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
    'scripts/**',
  ]),
]);
