import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GET as getHealth } from '@/app/api/health/route';
import { RATE_LIMITS } from '@/lib/constants';
import { __resetRateLimitState } from '@/lib/rateLimit';

/**
 * /api/health is public, so its contract is deliberately tiny: one field, no
 * configuration, and the same rate limit as every other route.
 */

const ORIGIN = 'http://localhost:3000';

const ENV_KEYS = [
  'UPSTASH_REDIS_REST_URL',
  'UPSTASH_REDIS_REST_TOKEN',
  'GEMINI_API_KEY',
  'GEMINI_MODEL',
] as const;

let saved: Record<string, string | undefined> = {};

beforeEach(() => {
  saved = {};
  for (const key of ENV_KEYS) {
    saved[key] = process.env[key];
    delete process.env[key];
  }
  vi.stubEnv('NODE_ENV', 'test');
  __resetRateLimitState();
});

afterEach(() => {
  vi.unstubAllEnvs();
  for (const key of ENV_KEYS) {
    if (saved[key] === undefined) delete process.env[key];
    else process.env[key] = saved[key];
  }
  __resetRateLimitState();
});

function request(extraHeaders: Record<string, string> = {}): Request {
  return new Request(`${ORIGIN}/api/health`, { headers: extraHeaders });
}

describe('/api/health', () => {
  it('returns only {"status":"ok"}, uncached', async () => {
    const response = await getHealth(request());
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toContain('no-store');
    expect(response.headers.get('x-content-type-options')).toBe('nosniff');
    expect(await response.text()).toBe('{"status":"ok"}');
  });

  it('discloses no environment, version or dependency detail', async () => {
    const body = await (await getHealth(request())).text();
    expect(body).not.toMatch(/upstash|redis|gemini|next|node|version|env/i);
  });

  it('applies the same rate limit as the other routes', async () => {
    for (let i = 0; i < RATE_LIMITS.health.limit; i += 1) {
      expect((await getHealth(request())).status).toBe(200);
    }
    const limited = await getHealth(request());
    expect(limited.status).toBe(429);
    expect(Number(limited.headers.get('retry-after'))).toBeGreaterThan(0);
    expect(await limited.text()).not.toContain('in-memory');
  });

  it('fails closed like the read routes when production has no limiter', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    __resetRateLimitState();
    const response = await getHealth(request());
    expect(response.status).toBe(503);
    expect(response.headers.get('retry-after')).toBeTruthy();
    expect(await response.text()).not.toMatch(/upstash|redis|token|url/i);
  });
});
