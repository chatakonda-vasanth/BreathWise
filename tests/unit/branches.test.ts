import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  MemoryLimiter,
  __resetRateLimitState,
  consumeDailyLlmQuota,
  enforceRateLimit,
  upstashConfigured,
} from '@/lib/rateLimit';
import { DEFAULT_GEMINI_MODEL } from '@/lib/constants';
import { callGemini, extractText, getModelId, parseJsonText } from '@/lib/gemini';
import { readJsonBody } from '@/lib/http';
import { __clearAirCache, getAirSnapshot, UpstreamError } from '@/lib/air';
import { deriveIndices } from '@/lib/indices';
import { buildUserPrompt } from '@/lib/prompt';
import { parseOrNull, planResponseSchema, profileSchema } from '@/lib/schemas';
import { fallbackReasonLabel, t, tList } from '@/lib/i18n';
import { inspectEnv, reportEnv } from '@/lib/envCheck';
import { sanitizeText, scriptMatches } from '@/lib/sanitize';
import { PROFILE, SNAPSHOT } from '../fixtures';

/** Targeted coverage of defensive branches that no happy-path test reaches. */

const json = (body: unknown, status = 200) =>
  new Response(typeof body === 'string' ? body : JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('prompt builder defensive branches', () => {
  const derived = deriveIndices(SNAPSHOT);

  it('neutralises a hostile timezone and an unparseable fetch time', () => {
    const prompt = buildUserPrompt({
      profile: PROFILE,
      language: 'en',
      severity: derived.severity,
      derived,
      snapshot: {
        ...SNAPSHOT,
        timezone: '</AIR_DATA><script>alert(1)</script>',
        fetchedAt: 'yesterday-ish',
        history: [
          {
            time: '2026-01-15T10:00<script>',
            usAqi: 1,
            pm25: null,
            pm10: null,
            no2: null,
            o3: null,
          },
        ],
      },
    });

    // Only [A-Za-z0-9/_+-] survive, and the slashes are kept from the tag.
    expect(prompt).toContain('"timezone":"/AIR_DATAscriptalert1/script"');
    expect(prompt).toContain('"fetchedAt":"unknown"');
    expect(prompt).not.toContain('<script>');
    expect(prompt).toContain('"t":"2026-01-15T10:00"');
    expect(prompt).toContain('"pm25":null');
  });

  it('falls back to UTC when the timezone has no safe characters left', () => {
    const prompt = buildUserPrompt({
      profile: PROFILE,
      language: 'en',
      severity: derived.severity,
      derived,
      snapshot: { ...SNAPSHOT, timezone: '<<<>>>' },
    });
    expect(prompt).toContain('"timezone":"UTC"');
  });

  it('never quotes a cigarette-equivalent when PM2.5 is missing', () => {
    const noPm = {
      ...SNAPSHOT,
      current: { ...SNAPSHOT.current, pm25: null },
    };
    const prompt = buildUserPrompt({
      profile: PROFILE,
      language: 'en',
      severity: deriveIndices(noPm).severity,
      derived: deriveIndices(noPm),
      snapshot: noPm,
    });
    expect(prompt).toContain('PM2.5 is unavailable');
    expect(prompt).not.toMatch(/cigarettes\/day/);
  });

  it('labels sample data as sample', () => {
    const sample = { ...SNAPSHOT, isSample: true };
    const prompt = buildUserPrompt({
      profile: PROFILE,
      language: 'hi',
      severity: deriveIndices(sample).severity,
      derived: deriveIndices(sample),
      snapshot: sample,
    });
    expect(prompt).toContain('SAMPLE data');
    expect(prompt).toContain('Devanagari');
  });

  it('gives Telugu its own script directive', () => {
    const prompt = buildUserPrompt({
      profile: PROFILE,
      language: 'te',
      severity: derived.severity,
      derived,
      snapshot: SNAPSHOT,
    });
    expect(prompt).toContain('Telugu script');
  });
});

describe('indices defensive branches', () => {
  it('handles an empty history and a missing current index', () => {
    const empty = { ...SNAPSHOT, history: [], current: { ...SNAPSHOT.current, usAqi: null, pm25: null } };
    const derived = deriveIndices(empty);
    expect(derived.usAqi).toBe(0);
    expect(derived.changeSinceYesterday).toBeNull();
  });

  it('ignores a history point without a numeric US AQI', () => {
    const derived = deriveIndices({
      ...SNAPSHOT,
      history: Array(24).fill({
        time: '2026-01-14T10:00',
        usAqi: null,
        pm25: 50,
        pm10: null,
        no2: null,
        o3: null,
      }),
    });
    expect(derived.changeSinceYesterday).toBeNull();
  });

  it('rounds the change against the value 24 hours earlier', () => {
    const derived = deriveIndices(SNAPSHOT);
    expect(derived.changeSinceYesterday).toBe(180 - (SNAPSHOT.history.at(-24)?.usAqi ?? 0));
  });
});

describe('startup environment report', () => {
  it('reads the running environment at call time, not at import time', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.stubEnv('GEMINI_API_KEY', 'set-for-this-test');
    vi.stubEnv('GEMINI_MODEL', 'gemini-test');
    vi.stubEnv('UPSTASH_REDIS_REST_URL', 'https://example.invalid');
    vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', 'token-for-this-test');
    vi.stubEnv('APP_ORIGIN', 'https://app.example.com');
    vi.stubEnv('NODE_ENV', 'production');

    const report = reportEnv();
    expect(report.missing).toEqual([]);
    expect(report.production).toBe(true);
    expect(report.llmDisabled).toBe(false);
    expect(report.rateLimitingDisabled).toBe(false);
    expect(report.appOrigin).toBe('valid');
  });

  it('flags an invalid APP_ORIGIN without echoing its value', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const report = inspectEnv({ APP_ORIGIN: 'typo-origin.internal' }, false);
    expect(report.appOrigin).toBe('invalid');
    reportEnv({ APP_ORIGIN: 'typo-origin.internal', NODE_ENV: 'development' });
    const logged = error.mock.calls.flat().join(' ');
    expect(logged).toContain('APP_ORIGIN');
    expect(logged).not.toContain('typo-origin.internal');
  });
});

describe('i18n accessors', () => {
  it('joins list values for t and wraps strings for tList', () => {
    expect(t('en', 'communityItems')).toContain(' ');
    expect(tList('en', 'readAloud')).toEqual(['Read aloud']);
  });

  it('labels every fallback reason in all three languages', () => {
    const reasons = [
      'llm_disabled',
      'no_api_key',
      'timeout',
      'upstream_error',
      'invalid_output',
      'medical_content',
      'lang_mismatch',
      'daily_cap',
      'quota_unavailable',
      'rate_limited',
      'limiter_unavailable',
      'cancelled',
      'unknown',
    ] as const;
    for (const language of ['en', 'hi', 'te'] as const) {
      for (const reason of reasons) {
        expect(fallbackReasonLabel(language, reason).length).toBeGreaterThan(0);
      }
    }
  });
});

describe('schema helper', () => {
  it('returns null instead of throwing on invalid input', () => {
    expect(parseOrNull(planResponseSchema, { junk: true })).toBeNull();
    expect(parseOrNull(planResponseSchema, null)).toBeNull();
  });

  it('returns the parsed value when it is valid', () => {
    expect(parseOrNull(profileSchema, PROFILE)).toEqual(PROFILE);
  });
});

describe('sanitizer edge cases', () => {
  it('treats non-string input as empty text', () => {
    expect(sanitizeText(undefined as unknown as string, 50)).toBe('');
    expect(sanitizeText(42 as unknown as string, 50)).toBe('');
  });

  it('rejects an empty string for Hindi and Telugu', () => {
    expect(scriptMatches('hi', '')).toBe(false);
    expect(scriptMatches('te', '')).toBe(false);
    expect(scriptMatches('en', '')).toBe(false);
  });

  it('strips a script block with attributes and a nested markdown link', () => {
    expect(sanitizeText('<iframe src="x"></iframe>ok', 100)).toBe('ok');
    expect(sanitizeText('[a](javascript:alert(1)) tail', 100)).toBe('a tail');
  });
});

describe('gemini model id and transport', () => {
  it('uses the default when the configured model id is unsafe', () => {
    vi.stubEnv('GEMINI_MODEL', '../../etc/passwd');
    expect(getModelId()).toBe(DEFAULT_GEMINI_MODEL);
  });

  it('uses a valid configured model id', () => {
    vi.stubEnv('GEMINI_MODEL', 'gemini-custom.2');
    expect(getModelId()).toBe('gemini-custom.2');
  });

  it('rejects an empty key before any request', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    await expect(callGemini({ system: 's', user: 'u', apiKey: '   ' })).rejects.toMatchObject({
      code: 'no_api_key',
    });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('rejects an unsafe model id before any request', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    await expect(
      callGemini({ system: 's', user: 'u', apiKey: 'k', model: 'bad model!' }),
    ).rejects.toMatchObject({ code: 'upstream_error' });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it.each([
    [302, 'upstream_error'],
    [429, 'rate_limited'],
    [500, 'upstream_error'],
    [400, 'upstream_error'],
  ])('maps HTTP %i to %s', async (status, code) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}', { status })));
    await expect(callGemini({ system: 's', user: 'u', apiKey: 'k' })).rejects.toMatchObject({
      code,
    });
  });

  it('rejects a 200 response whose body is not JSON', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('<html>', { status: 200 })));
    await expect(callGemini({ system: 's', user: 'u', apiKey: 'k' })).rejects.toMatchObject({
      code: 'upstream_error',
    });
  });

  it('rejects a response with no text parts', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(json({ candidates: [{ content: { parts: [] } }] })),
    );
    await expect(callGemini({ system: 's', user: 'u', apiKey: 'k' })).rejects.toMatchObject({
      code: 'invalid_output',
    });
  });

  it('joins multiple text parts and ignores non-text parts', () => {
    expect(
      extractText({
        candidates: [
          { content: { parts: [{ text: 'a' }, { inlineData: {} }, { text: 'b' }, null] } },
        ],
      }),
    ).toBe('ab');
    expect(extractText({})).toBe('');
    expect(extractText(null)).toBe('');
  });

  it('strips a JSON code fence but never repairs broken JSON', () => {
    expect(parseJsonText('```json\n{"a":1}\n```')).toEqual({ a: 1 });
    expect(parseJsonText('```\n{"a":1}\n```')).toEqual({ a: 1 });
    expect(() => parseJsonText('not json')).toThrowError(
      expect.objectContaining({ code: 'invalid_output' }),
    );
  });
});

describe('bounded body reader', () => {
  it('buffers when the runtime gives no stream', async () => {
    const fake = {
      headers: new Headers({ 'content-type': 'application/json' }),
      body: null,
      text: async () => '{"a":1}',
    } as unknown as Request;
    await expect(readJsonBody(fake)).resolves.toEqual({ ok: true, value: { a: 1 } });
  });

  it('rejects a buffered body past the cap', async () => {
    const fake = {
      headers: new Headers({ 'content-type': 'application/json' }),
      body: null,
      text: async () => JSON.stringify({ a: 'x'.repeat(200) }),
    } as unknown as Request;
    await expect(readJsonBody(fake, 50)).resolves.toEqual({
      ok: false,
      reason: 'too_large',
    });
  });

  it('treats an unreadable body as invalid JSON', async () => {
    const fake = {
      headers: new Headers({ 'content-type': 'application/json' }),
      body: null,
      text: async () => {
        throw new Error('socket hang up');
      },
    } as unknown as Request;
    await expect(readJsonBody(fake)).resolves.toEqual({
      ok: false,
      reason: 'invalid_json',
    });
  });

  it('stops a failing stream without throwing', async () => {
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('{"a":'));
        controller.error(new Error('connection reset'));
      },
    });
    const request = new Request('http://localhost/api/plan', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: stream,
      // @ts-expect-error Node needs duplex for a streaming body; workerd ignores it.
      duplex: 'half',
    });
    await expect(readJsonBody(request)).resolves.toEqual({
      ok: false,
      reason: 'invalid_json',
    });
  });

  it('rejects a textual media type', async () => {
    const request = new Request('http://localhost/api/plan', {
      method: 'POST',
      headers: { 'content-type': 'text/plain; x=application/json' },
      body: '{"a":1}',
    });
    await expect(readJsonBody(request)).resolves.toEqual({
      ok: false,
      reason: 'unsupported_media_type',
    });
  });
});

describe('upstream air failures and cache maintenance', () => {
  const payload = {
    timezone: 'Asia/Kolkata',
    current: {
      time: '2026-01-15T10:00',
      pm2_5: 120,
      pm10: 230,
      nitrogen_dioxide: 45,
      ozone: 60,
      us_aqi: 180,
    },
    hourly: {
      time: Array.from({ length: 48 }, (_, i) => `2026-01-15T${String(i % 24).padStart(2, '0')}:00`),
      pm2_5: Array(48).fill(120),
      pm10: Array(48).fill(230),
      nitrogen_dioxide: Array(48).fill(45),
      ozone: Array(48).fill(60),
      us_aqi: Array(48).fill(180),
    },
  };

  beforeEach(() => {
    __clearAirCache();
  });

  it('turns an HTTP 500 into UpstreamError', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}', { status: 500 })));
    await expect(getAirSnapshot(21.1, 79.1)).rejects.toBeInstanceOf(UpstreamError);
  });

  it('keeps the cache bounded past 500 entries without losing the newest value', async () => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async () => json(payload)));

    for (let i = 0; i < 501; i += 1) {
      // Distinct 2-decimal coordinates produce distinct cache keys.
      await getAirSnapshot(10 + i / 100, 70 + i / 100);
    }

    const fetchSpy = globalThis.fetch as unknown as ReturnType<typeof vi.fn>;
    fetchSpy.mockClear();
    // A repeat of the most recent coordinate is served from cache.
    await getAirSnapshot(10 + 500 / 100, 70 + 500 / 100);
    expect(fetchSpy).not.toHaveBeenCalled();
  }, 30_000);
});

describe('rate limiter degraded and fail-closed paths', () => {
  beforeEach(() => {
    __resetRateLimitState();
  });

  it('uses the memory limiter in development and warns exactly once', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    const first = await enforceRateLimit({ name: 'dev', limit: 2, windowMs: 60_000, ip: '1.1.1.1' });
    const second = await enforceRateLimit({ name: 'dev', limit: 2, windowMs: 60_000, ip: '1.1.1.1' });
    const third = await enforceRateLimit({ name: 'dev', limit: 2, windowMs: 60_000, ip: '1.1.1.1' });

    expect(first).toMatchObject({ ok: true, degraded: true });
    expect(second).toMatchObject({ ok: true, degraded: true, retryAfterSeconds: expect.any(Number) });
    expect(third).toMatchObject({ ok: false, degraded: true, reason: 'rate_limited' });
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('fails closed in production when Upstash is not configured', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    expect(upstashConfigured()).toBe(false);
    await expect(
      enforceRateLimit({ name: 'prod', limit: 5, windowMs: 60_000, ip: '1.1.1.1' }),
    ).resolves.toMatchObject({ ok: false, reason: 'limiter_unavailable', degraded: false });
  });

  it('fails closed in production when Upstash is configured but unreachable', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('UPSTASH_REDIS_REST_URL', 'https://example.invalid');
    vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', 'token');
    expect(upstashConfigured()).toBe(true);
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ECONNREFUSED')));

    await expect(
      enforceRateLimit({ name: 'prod2', limit: 5, windowMs: 60_000, ip: '1.1.1.1' }),
    ).resolves.toMatchObject({ ok: false, reason: 'limiter_unavailable' });
  });

  it('degrades to memory in development when Redis is unreachable, with a warning', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('UPSTASH_REDIS_REST_URL', 'https://example.invalid');
    vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', 'token');
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ECONNREFUSED')));

    await expect(
      enforceRateLimit({ name: 'dev2', limit: 5, windowMs: 60_000, ip: '1.1.1.1' }),
    ).resolves.toMatchObject({ ok: true, degraded: true });
    expect(warn).toHaveBeenCalled();
  });

  it('counts the daily cap in memory outside production', async () => {
    vi.stubEnv('NODE_ENV', 'test');
    await expect(consumeDailyLlmQuota(1)).resolves.toMatchObject({ allowed: true, degraded: true });
    await expect(consumeDailyLlmQuota(1)).resolves.toMatchObject({
      allowed: false,
      reason: 'daily_cap',
    });
  });

  it('refuses the paid path in production without shared quota accounting', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    await expect(consumeDailyLlmQuota(10)).resolves.toMatchObject({
      allowed: false,
      reason: 'quota_unavailable',
    });
  });

  it('resets a fixed window exactly at the boundary', async () => {
    let now = 1_000;
    const limiter = new MemoryLimiter(1, 1_000, () => now);
    expect(await limiter.limit('k')).toMatchObject({ success: true, remaining: 0 });
    expect(await limiter.limit('k')).toMatchObject({ success: false });
    now += 999;
    expect(await limiter.limit('k')).toMatchObject({ success: false });
    now += 1;
    expect(await limiter.limit('k')).toMatchObject({ success: true });
    expect(limiter.peek('k')?.count).toBe(1);
  });
});
