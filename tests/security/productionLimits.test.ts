import type { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GET as getAir } from '@/app/api/air/route';
import { GET as getGeocode } from '@/app/api/geocode/route';
import { POST as postPlan } from '@/app/api/plan/route';
import { RATE_LIMITS } from '@/lib/constants';
import { __resetRateLimitState } from '@/lib/rateLimit';
import { planResponseSchema } from '@/lib/schemas';
import { PROFILE } from '../fixtures';

/**
 * Production rate limiting must never be optional: no Upstash means no model
 * call and no un-limited public route. Spoofed forwarding headers must not buy
 * a fresh bucket, and every refusal must be labelled.
 */

const ORIGIN = 'http://localhost:3000';

const ENV_KEYS = [
  'GEMINI_API_KEY',
  'GEMINI_MODEL',
  'APP_ORIGIN',
  'DAILY_LLM_CAP',
  'UPSTASH_REDIS_REST_URL',
  'UPSTASH_REDIS_REST_TOKEN',
] as const;

let saved: Record<string, string | undefined> = {};

beforeEach(() => {
  saved = {};
  for (const key of ENV_KEYS) {
    saved[key] = process.env[key];
    delete process.env[key];
  }
  vi.stubEnv('NODE_ENV', 'test');
  process.env.APP_ORIGIN = ORIGIN;
  process.env.GEMINI_MODEL = 'gemini-3.5-flash';
  process.env.DAILY_LLM_CAP = '200';
  __resetRateLimitState();
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  for (const key of ENV_KEYS) {
    if (saved[key] === undefined) delete process.env[key];
    else process.env[key] = saved[key];
  }
  vi.restoreAllMocks();
  __resetRateLimitState();
});

function planRequest(extraHeaders: Record<string, string> = {}) {
  return new Request(`${ORIGIN}/api/plan`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      origin: ORIGIN,
      'sec-fetch-site': 'same-origin',
      ...extraHeaders,
    },
    body: JSON.stringify({
      profile: { ...PROFILE, language: 'en' },
      lat: 28.61,
      lon: 77.21,
      sample: true,
    }),
  });
}

async function post(extraHeaders: Record<string, string> = {}) {
  const response = await postPlan(planRequest(extraHeaders) as unknown as NextRequest);
  const text = await response.text();
  return { status: response.status, headers: response.headers, text };
}

describe('production: missing Upstash fails closed', () => {
  it('/api/plan returns a labelled fallback plan (200) and never calls the model', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    process.env.GEMINI_API_KEY = 'test-key-not-real';
    const fetchMock = vi.fn(async () => {
      throw new Error('no upstream may be called');
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await post();

    expect(result.status).toBe(200);
    const parsed = planResponseSchema.safeParse(JSON.parse(result.text));
    expect(parsed.success).toBe(true);
    if (!parsed.success) throw new Error('response did not match the plan schema');

    expect(parsed.data.meta.generatedBy).toBe('fallback');
    expect(parsed.data.meta.fallbackReason).toBe('limiter_unavailable');
    expect(parsed.data.plan.fallbackReason).toBe('limiter_unavailable');
    expect(parsed.data.plan.headline.length).toBeGreaterThan(0);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.text).not.toContain('test-key-not-real');
  });

  it('/api/plan fails closed when Upstash is configured but unreachable', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    process.env.GEMINI_API_KEY = 'test-key-not-real';
    process.env.UPSTASH_REDIS_REST_URL = 'https://127.0.0.1:1';
    process.env.UPSTASH_REDIS_REST_TOKEN = 'fake-token';
    __resetRateLimitState();

    const fetchMock = vi.fn(async (url: string | URL) => {
      throw new Error(`upstream must not be called: ${String(url)}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await post();
    expect(result.status).toBe(200);
    const parsed = planResponseSchema.safeParse(JSON.parse(result.text));
    expect(parsed.success).toBe(true);
    if (!parsed.success) throw new Error('response did not match the plan schema');
    expect(parsed.data.meta.fallbackReason).toBe('limiter_unavailable');
    // The Upstash client's own fetch attempts are expected here; the model must
    // never be contacted.
    const hosts = fetchMock.mock.calls.map((call) => String(call[0]));
    expect(hosts.some((url) => url.includes('generativelanguage.googleapis.com'))).toBe(false);
  });

  it('/api/air answers 503 with a generic message', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    const fetchMock = vi.fn(async () => {
      throw new Error('upstream must not be called');
    });
    vi.stubGlobal('fetch', fetchMock);

    const response = await getAir(new Request(`${ORIGIN}/api/air?lat=28.61&lon=77.21`));
    const body = (await response.json()) as { error: string; message: string };

    expect(response.status).toBe(503);
    expect(body.error).toBe('service_unavailable');
    expect(body.message).not.toMatch(/upstash|redis|limiter|127\.0\.0\.1/i);
    expect(response.headers.get('Retry-After')).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('/api/geocode answers 503 with a generic message', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    const response = await getGeocode(new Request(`${ORIGIN}/api/geocode?q=delhi`));
    const body = (await response.json()) as { error: string; message: string };
    expect(response.status).toBe(503);
    expect(body.error).toBe('service_unavailable');
    expect(body.message).not.toMatch(/upstash|redis|limiter/i);
  });
});

describe('rate-limit refusals', () => {
  it('returns 429 with Retry-After once the plan limit is exceeded', async () => {
    for (let i = 0; i < RATE_LIMITS.plan.limit; i += 1) {
      const allowed = await post({ 'x-vercel-forwarded-for': '203.0.113.20' });
      expect(allowed.status).toBe(200);
    }

    const blocked = await post({ 'x-vercel-forwarded-for': '203.0.113.20' });
    expect(blocked.status).toBe(429);
    expect(blocked.headers.get('Retry-After')).toMatch(/^\d+$/);
    expect(Number(blocked.headers.get('Retry-After'))).toBeGreaterThan(0);
    expect(JSON.parse(blocked.text)).toMatchObject({ error: 'rate_limited' });
  });

  it('cannot be bypassed or reset by rotating a spoofed X-Forwarded-For', async () => {
    const trusted = { 'x-vercel-forwarded-for': '203.0.113.30' };

    for (let i = 0; i < RATE_LIMITS.plan.limit; i += 1) {
      const allowed = await post({ ...trusted, 'x-forwarded-for': `10.0.0.${i}` });
      expect(allowed.status).toBe(200);
    }

    // New XFF values, same trusted client address: still the same bucket.
    for (let i = 0; i < 3; i += 1) {
      const blocked = await post({
        ...trusted,
        'x-forwarded-for': `192.0.2.${100 + i}, 10.9.9.9`,
      });
      expect(blocked.status).toBe(429);
      expect(blocked.headers.get('Retry-After')).toBeTruthy();
    }
  });

  // Regression: the limiter used to run before the origin check, so a page could
  // post cross-site (a plain form needs no preflight) and burn a visitor's
  // six-per-minute plan budget without ever producing a plan.
  it('does not spend the request budget on rejected cross-site POSTs', async () => {
    const client = { 'x-vercel-forwarded-for': '203.0.113.40' };

    for (let i = 0; i < RATE_LIMITS.plan.limit + 3; i += 1) {
      const rejected = await post({ ...client, origin: 'https://evil.example' });
      expect(rejected.status).toBe(403);
    }

    const allowed = await post(client);
    expect(allowed.status).toBe(200);
  });

  it('answers 429 with Retry-After on /api/air as well', async () => {
    // Invalid queries still consume the limit, so no upstream call is needed.
    for (let i = 0; i < RATE_LIMITS.air.limit; i += 1) {
      const response = await getAir(new Request(`${ORIGIN}/api/air`));
      expect(response.status).toBe(400);
    }
    const blocked = await getAir(new Request(`${ORIGIN}/api/air`));
    expect(blocked.status).toBe(429);
    expect(Number(blocked.headers.get('Retry-After'))).toBeGreaterThan(0);
  });
});
