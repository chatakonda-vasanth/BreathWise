import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';
import { readEnv } from '@/lib/shared/env';
import type { Limiter } from './types';
import { upstashConfigured } from './runtime';

const redisLimiters = new Map<string, Limiter>();

/** Shared Redis client so limiter calls reuse one connection pool. */
let redisClient: Redis | null = null;

export function getRedis(): Redis | null {
  if (!upstashConfigured()) return null;
  if (!redisClient) {
    redisClient = new Redis({
      url: readEnv('UPSTASH_REDIS_REST_URL') ?? '',
      token: readEnv('UPSTASH_REDIS_REST_TOKEN') ?? '',
    });
  }
  return redisClient;
}

export function getRedisLimiter(name: string, limit: number, windowMs: number): Limiter | null {
  if (!upstashConfigured()) return null;
  const cacheKey = `${name}:${limit}:${windowMs}`;
  const existing = redisLimiters.get(cacheKey);
  if (existing) return existing;

  const redis = getRedis();
  /* istanbul ignore next -- getRedis() is non-null whenever upstashConfigured() */
  if (!redis) return null;

  const limiter = new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(limit, `${Math.round(windowMs / 1000)} s`),
    prefix: `cleanair:rl:${name}`,
    analytics: false,
  });
  const wrapped: Limiter = {
    async limit(key: string) {
      const result = await limiter.limit(key);
      return {
        success: result.success,
        remaining: result.remaining,
        reset: result.reset,
      };
    },
  };
  redisLimiters.set(cacheKey, wrapped);
  return wrapped;
}

export function resetRedisLimiters(): void {
  redisLimiters.clear();
  redisClient = null;
}
