import { afterEach, describe, expect, it, vi } from 'vitest';
import { inspectEnv, reportEnv } from '@/lib/envCheck';

const SECRET_KEY = 'AIzaSy-not-a-real-key-value';
const SECRET_TOKEN = 'AXupstash-not-a-real-token';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('inspectEnv', () => {
  it('lists every missing required variable', () => {
    const report = inspectEnv({}, false);
    expect(report.missing).toEqual([
      'GEMINI_API_KEY',
      'GEMINI_MODEL',
      'UPSTASH_REDIS_REST_URL',
      'UPSTASH_REDIS_REST_TOKEN',
    ]);
    expect(report.llmDisabled).toBe(true);
    expect(report.rateLimitingDisabled).toBe(false);
  });

  it('treats blank values as missing', () => {
    const report = inspectEnv(
      {
        GEMINI_API_KEY: '   ',
        GEMINI_MODEL: '',
        UPSTASH_REDIS_REST_URL: ' ',
        UPSTASH_REDIS_REST_TOKEN: '',
      },
      true,
    );
    expect(report.missing).toHaveLength(4);
  });

  it('flags production as unable to rate limit without Upstash', () => {
    const report = inspectEnv(
      { GEMINI_API_KEY: SECRET_KEY, GEMINI_MODEL: 'gemini-3.5-flash' },
      true,
    );
    expect(report.missing).toEqual([
      'UPSTASH_REDIS_REST_URL',
      'UPSTASH_REDIS_REST_TOKEN',
    ]);
    expect(report.rateLimitingDisabled).toBe(true);
    expect(report.llmDisabled).toBe(false);
  });

  // Regression: a malformed APP_ORIGIN makes /api/plan reject every POST, so the
  // startup check has to say so instead of letting it look configured.
  it('flags an APP_ORIGIN that is not an absolute http(s) origin', () => {
    const base = {
      GEMINI_API_KEY: SECRET_KEY,
      GEMINI_MODEL: 'gemini-3.5-flash',
      UPSTASH_REDIS_REST_URL: 'https://example.upstash.io',
      UPSTASH_REDIS_REST_TOKEN: SECRET_TOKEN,
    };

    expect(inspectEnv(base, true).appOrigin).toBe('unset');
    expect(
      inspectEnv({ ...base, APP_ORIGIN: 'https://cleanair.example' }, true).appOrigin,
    ).toBe('valid');
    expect(
      inspectEnv({ ...base, APP_ORIGIN: 'https://cleanair.example/' }, true).appOrigin,
    ).toBe('valid');

    for (const broken of [
      'cleanair.example',
      'cleanair.example:443',
      'ftp://cleanair.example',
    ]) {
      expect(inspectEnv({ ...base, APP_ORIGIN: broken }, true).appOrigin).toBe('invalid');
    }
  });

  it('is clean when all four are set', () => {
    const report = inspectEnv(
      {
        GEMINI_API_KEY: SECRET_KEY,
        GEMINI_MODEL: 'gemini-3.5-flash',
        UPSTASH_REDIS_REST_URL: 'https://example.upstash.io',
        UPSTASH_REDIS_REST_TOKEN: SECRET_TOKEN,
      },
      true,
    );
    expect(report.missing).toEqual([]);
    expect(report.rateLimitingDisabled).toBe(false);
    expect(report.llmDisabled).toBe(false);
  });
});

describe('reportEnv', () => {
  it('logs missing variable names and never their values', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    reportEnv({
      NODE_ENV: 'production',
      GEMINI_API_KEY: SECRET_KEY,
      GEMINI_MODEL: '',
      UPSTASH_REDIS_REST_TOKEN: SECRET_TOKEN,
    });

    const output = [...error.mock.calls, ...warn.mock.calls]
      .map((call) => call.map(String).join(' '))
      .join('\n');

    expect(output).toContain('GEMINI_MODEL');
    expect(output).toContain('UPSTASH_REDIS_REST_URL');
    expect(output).toContain('/api/plan');
    expect(output).toContain('503');
    expect(output).not.toContain(SECRET_KEY);
    expect(output).not.toContain(SECRET_TOKEN);
  });

  it('reports an invalid APP_ORIGIN by name and never by value', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});

    reportEnv({
      NODE_ENV: 'production',
      GEMINI_API_KEY: SECRET_KEY,
      GEMINI_MODEL: 'gemini-3.5-flash',
      UPSTASH_REDIS_REST_URL: 'https://example.upstash.io',
      UPSTASH_REDIS_REST_TOKEN: SECRET_TOKEN,
      APP_ORIGIN: 'cleanair.example',
    });

    const output = error.mock.calls.map((call) => String(call[0])).join('\n');
    expect(output).toContain('APP_ORIGIN');
    expect(output).toContain('403');
    expect(output).not.toContain('cleanair.example');
    expect(output).not.toContain(SECRET_KEY);
  });

  it('does not crash and disables only the model when the AI key is missing', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});

    const report = reportEnv({
      NODE_ENV: 'development',
      GEMINI_MODEL: 'gemini-3.5-flash',
      UPSTASH_REDIS_REST_URL: 'https://example.upstash.io',
      UPSTASH_REDIS_REST_TOKEN: SECRET_TOKEN,
    });

    expect(report.llmDisabled).toBe(true);
    expect(report.rateLimitingDisabled).toBe(false);
    expect(report.missing).toEqual(['GEMINI_API_KEY']);
    expect(error.mock.calls.map((call) => String(call[0])).join('\n')).toContain(
      'rule-based fallback',
    );
  });
});
