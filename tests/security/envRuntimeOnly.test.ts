import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { readEnv } from '@/lib/shared/env';

/**
 * Regression guard for the deployment leak: Next replaces a *literal*
 * `process.env.NAME` with the value it loaded at build time, which baked
 * `.env.local` secrets into the deployed Worker bundle. All server
 * configuration must therefore go through `readEnv`'s dynamic lookup.
 */

const SERVER_CONFIG_NAMES = [
  'GEMINI_API_KEY',
  'GEMINI_MODEL',
  'UPSTASH_REDIS_REST_URL',
  'UPSTASH_REDIS_REST_TOKEN',
  'APP_ORIGIN',
  'DAILY_LLM_CAP',
  'LLM_DISABLED',
  'LLM_ATTEMPT_TIMEOUT_MS',
];

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) return sourceFiles(full);
    return /\.(ts|tsx|mjs|js)$/.test(entry) ? [full] : [];
  });
}

describe('runtime-only environment access', () => {
  it('never reads a server config value with a literal process.env access', () => {
    const offenders: string[] = [];
    for (const file of sourceFiles('src')) {
      const text = readFileSync(file, 'utf8');
      for (const name of SERVER_CONFIG_NAMES) {
        // `process.env.GEMINI_API_KEY`, `process.env['GEMINI_API_KEY']` and
        // `process.env["GEMINI_API_KEY"]` are all statically foldable.
        const patterns = [
          new RegExp(`process\\.env\\.${name}\\b`),
          new RegExp(`process\\.env\\[['"]${name}['"]\\]`),
        ];
        if (patterns.some((pattern) => pattern.test(text))) {
          offenders.push(`${file}: ${name}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it('resolves values at call time, not at import time', () => {
    const saved = process.env.GEMINI_MODEL;
    try {
      process.env.GEMINI_MODEL = 'first-model';
      expect(readEnv('GEMINI_MODEL')).toBe('first-model');
      process.env.GEMINI_MODEL = 'second-model';
      expect(readEnv('GEMINI_MODEL')).toBe('second-model');
    } finally {
      if (saved === undefined) delete process.env.GEMINI_MODEL;
      else process.env.GEMINI_MODEL = saved;
    }
  });

  it('returns undefined for unset and non-string values', () => {
    expect(readEnv('CLEANAIR_DEFINITELY_NOT_SET')).toBeUndefined();
  });
});
