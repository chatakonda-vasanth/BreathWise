import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  MemoryLimiter,
  __resetRateLimitState,
  consumeDailyLlmQuota,
  enforceRateLimit,
} from '@/lib/rateLimit';

const ENV_KEYS = [
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
  __resetRateLimitState();
});

afterEach(() => {
  for (const key of ENV_KEYS) {
    if (saved[key] === undefined) delete process.env[key];
    else process.env[key] = saved[key];
  }
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

describe('enforceRateLimit', () => {
  it('uses the in-memory limiter and reports degraded when Upstash is absent', async () => {
    const first = await enforceRateLimit({
      name: 'test-air',
      limit: 2,
      windowMs: 60_000,
      ip: '203.0.113.9',
      failClosed: false,
    });
    expect(first.ok).toBe(true);
    expect(first.degraded).toBe(true);

    const second = await enforceRateLimit({
      name: 'test-air',
      limit: 2,
      windowMs: 60_000,
      ip: '203.0.113.9',
      failClosed: false,
    });
    expect(second.ok).toBe(true);

    const third = await enforceRateLimit({
      name: 'test-air',
      limit: 2,
      windowMs: 60_000,
      ip: '203.0.113.9',
      failClosed: false,
    });
    expect(third.ok).toBe(false);
    expect(third.reason).toBe('rate_limited');
    expect(third.retryAfterSeconds).toBeGreaterThan(0);
  });

  it('fails closed on the paid route when the limiter is unreachable', async () => {
    process.env.UPSTASH_REDIS_REST_URL = 'https://127.0.0.1:1';
    process.env.UPSTASH_REDIS_REST_TOKEN = 'fake-token';
    __resetRateLimitState();

    const result = await enforceRateLimit({
      name: 'test-plan',
      limit: 5,
      windowMs: 60_000,
      ip: '203.0.113.10',
      failClosed: true,
    });
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('limiter_unavailable');
  });

  it('falls back to memory on public routes when the limiter is unreachable', async () => {
    process.env.UPSTASH_REDIS_REST_URL = 'https://127.0.0.1:1';
    process.env.UPSTASH_REDIS_REST_TOKEN = 'fake-token';
    __resetRateLimitState();

    const result = await enforceRateLimit({
      name: 'test-geocode',
      limit: 5,
      windowMs: 60_000,
      ip: '203.0.113.11',
      failClosed: false,
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
