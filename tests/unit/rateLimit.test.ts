import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  MemoryLimiter,
  __resetRateLimitState,
  consumeDailyLlmQuota,
  enforceRateLimit,
} from '@/lib/security/rateLimit';

const ENV_KEYS = ['UPSTASH_REDIS_REST_URL', 'UPSTASH_REDIS_REST_TOKEN'] as const;

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
  vi.restoreAllMocks();
  __resetRateLimitState();
});

describe('MemoryLimiter', () => {
  it('allows exactly the limit then blocks', async () => {
    let now = 1000;
    const limiter = new MemoryLimiter(3, 60_000, () => now);

    expect((await limiter.limit('k')).success).toBe(true);
    expect((await limiter.limit('k')).success).toBe(true);
    expect((await limiter.limit('k')).success).toBe(true);
    const blocked = await limiter.limit('k');
    expect(blocked.success).toBe(false);
    expect(blocked.remaining).toBe(0);

    now += 60_001;
    expect((await limiter.limit('k')).success).toBe(true);
  });

  it('keeps buckets separate per key', async () => {
    const limiter = new MemoryLimiter(1, 60_000, () => 1000);
    expect((await limiter.limit('a')).success).toBe(true);
    expect((await limiter.limit('b')).success).toBe(true);
    expect((await limiter.limit('a')).success).toBe(false);
  });
});

describe('production without a shared limiter', () => {
  it('fails closed for every route when Upstash is not configured', async () => {
    vi.stubEnv('NODE_ENV', 'production');

    for (const name of ['plan', 'air', 'geocode']) {
      const result = await enforceRateLimit({
        name,
        limit: 5,
        windowMs: 60_000,
        ip: '203.0.113.9',
      });
      expect(result.ok).toBe(false);
      expect(result.reason).toBe('limiter_unavailable');
      expect(result.degraded).toBe(false);
      expect(result.retryAfterSeconds).toBeGreaterThan(0);
    }
  });

  it('fails closed when Upstash is configured but unreachable', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    process.env.UPSTASH_REDIS_REST_URL = 'https://127.0.0.1:1';
    process.env.UPSTASH_REDIS_REST_TOKEN = 'fake-token';
    __resetRateLimitState();

    const result = await enforceRateLimit({
      name: 'plan',
      limit: 5,
      windowMs: 60_000,
      ip: '203.0.113.10',
    });
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('limiter_unavailable');
  });

  it('fails the daily cap closed when Upstash is not configured', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    const result = await consumeDailyLlmQuota(10);
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe('quota_unavailable');
  });
});

describe('development fallback', () => {
  it('uses the in-memory limiter and warns exactly once', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    __resetRateLimitState();

    const args = {
      name: 'test-air',
      limit: 2,
      windowMs: 60_000,
      ip: '203.0.113.9',
    };

    expect((await enforceRateLimit(args)).ok).toBe(true);
    expect((await enforceRateLimit(args)).ok).toBe(true);
    const third = await enforceRateLimit(args);
    expect(third.ok).toBe(false);
    expect(third.reason).toBe('rate_limited');
    expect(third.retryAfterSeconds).toBeGreaterThan(0);

    const messages = warn.mock.calls.map((call) => String(call[0]));
    const memoryWarnings = messages.filter((message) =>
      message.includes('in-memory rate limiter'),
    );
    expect(memoryWarnings).toHaveLength(1);
    // Names only, never a credential value.
    expect(memoryWarnings[0]).toContain('UPSTASH_REDIS_REST_URL');
    expect(memoryWarnings[0]).not.toContain('fake-token');
  });

  it('degrades to memory when the limiter is unreachable outside production', async () => {
    process.env.UPSTASH_REDIS_REST_URL = 'https://127.0.0.1:1';
    process.env.UPSTASH_REDIS_REST_TOKEN = 'fake-token';
    __resetRateLimitState();

    const result = await enforceRateLimit({
      name: 'test-geocode',
      limit: 5,
      windowMs: 60_000,
      ip: '203.0.113.11',
    });
    expect(result.ok).toBe(true);
    expect(result.degraded).toBe(true);
  });
});

describe('daily LLM quota', () => {
  it('counts against the cap in memory when Upstash is absent', async () => {
    expect((await consumeDailyLlmQuota(2)).allowed).toBe(true);
    expect((await consumeDailyLlmQuota(2)).allowed).toBe(true);
    const blocked = await consumeDailyLlmQuota(2);
    expect(blocked.allowed).toBe(false);
    expect(blocked.reason).toBe('daily_cap');
  });

  it('fails closed when quota accounting is unreachable', async () => {
    process.env.UPSTASH_REDIS_REST_URL = 'https://127.0.0.1:1';
    process.env.UPSTASH_REDIS_REST_TOKEN = 'fake-token';
    const result = await consumeDailyLlmQuota(10);
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe('quota_unavailable');
  });
});
