import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';
import { hashIp } from './http';

/**
 * Rate limiting.
 *
 * Serverless instances do not share memory, so production uses Upstash Redis.
 * The in-memory limiter exists for local development and tests only; it is
 * reported as `degraded` so callers can decide how strict to be.
 */

export interface LimitOutcome {
  success: boolean;
  remaining: number;
  reset: number;
}

export interface Limiter {
  limit(key: string): Promise<LimitOutcome>;
}

interface Bucket {
  count: number;
  resetAt: number;
}

/** Fixed-window in-memory limiter with an injectable clock (unit tested). */
export class MemoryLimiter implements Limiter {
  private readonly buckets = new Map<string, Bucket>();

  constructor(
    private readonly limitCount: number,
    private readonly windowMs: number,
    private readonly now: () => number = Date.now,
  ) {}

  async limit(key: string): Promise<LimitOutcome> {
    const now = this.now();
    const existing = this.buckets.get(key);

    if (!existing || existing.resetAt <= now) {
      const resetAt = now + this.windowMs;
      this.buckets.set(key, { count: 1, resetAt });
      this.sweep(now);
      return { success: true, remaining: this.limitCount - 1, reset: resetAt };
    }

    if (existing.count >= this.limitCount) {
      return { success: false, remaining: 0, reset: existing.resetAt };
    }
    existing.count += 1;
    return {
      success: true,
      remaining: this.limitCount - existing.count,
      reset: existing.resetAt,
    };
  }

  /** Prevent unbounded growth from junk keys. */
  private sweep(now: number): void {
    if (this.buckets.size < 5000) return;
    for (const [key, bucket] of this.buckets) {
      if (bucket.resetAt <= now) this.buckets.delete(key);
    }
  }

  peek(key: string): Bucket | undefined {
    return this.buckets.get(key);
  }
}

const redisLimiters = new Map<string, Limiter>();

function upstashConfigured(): boolean {
  return Boolean(
    process.env.UPSTASH_REDIS_REST_URL?.trim() &&
      process.env.UPSTASH_REDIS_REST_TOKEN?.trim(),
  );
}

function getRedisLimiter(name: string, limit: number, windowMs: number): Limiter | null {
  if (!upstashConfigured()) return null;
  const cacheKey = `${name}:${limit}:${windowMs}`;
  const existing = redisLimiters.get(cacheKey);
  if (existing) return existing;

  const redis = new Redis({
    url: process.env.UPSTASH_REDIS_REST_URL as string,
    token: process.env.UPSTASH_REDIS_REST_TOKEN as string,
  });
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

const memoryLimiters = new Map<string, MemoryLimiter>();

function getMemoryLimiter(name: string, limit: number, windowMs: number): MemoryLimiter {
  const cacheKey = `${name}:${limit}:${windowMs}`;
  const existing = memoryLimiters.get(cacheKey);
  if (existing) return existing;
  const created = new MemoryLimiter(limit, windowMs);
  memoryLimiters.set(cacheKey, created);
  return created;
}

/** Bounded wait: a hung limiter must never hold a request open. */
function withTimeout<T>(promise: Promise<T>, ms = 1500): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => {
      const timer = setTimeout(() => reject(new Error('limiter_timeout')), ms);
      // Do not keep the process alive for the timer alone.
      (timer as unknown as { unref?: () => void }).unref?.();
    }),
  ]);
}

export interface EnforceOptions {
  name: string;
  limit: number;
  windowMs: number;
  /** Raw client IP: hashed here so no address is stored. */
  ip: string;
  /** When true, an unreachable limiter blocks the request instead of allowing it. */
  failClosed: boolean;
}

export interface EnforceResult {
  ok: boolean;
  retryAfterSeconds: number;
  /** True when the decision came from the per-instance memory limiter. */
  degraded: boolean;
  reason?: 'rate_limited' | 'limiter_unavailable';
}

export async function enforceRateLimit(options: EnforceOptions): Promise<EnforceResult> {
  const key = hashIp(options.ip);
  const redisLimiter = getRedisLimiter(options.name, options.limit, options.windowMs);

  if (redisLimiter) {
    try {
      const outcome = await withTimeout(redisLimiter.limit(key));
      return {
        ok: outcome.success,
        retryAfterSeconds: Math.max(1, Math.ceil((outcome.reset - Date.now()) / 1000)),
        degraded: false,
        ...(outcome.success ? {} : { reason: 'rate_limited' as const }),
      };
    } catch {
      if (options.failClosed) {
        return {
          ok: false,
          retryAfterSeconds: 30,
          degraded: true,
          reason: 'limiter_unavailable',
        };
      }
      // /api/air and /api/geocode are cheap and cache-backed: degrade to memory
      // rather than going dark. Documented in SECURITY.md.
    }
  }

  const memory = getMemoryLimiter(options.name, options.limit, options.windowMs);
  const outcome = await memory.limit(key);
  return {
    ok: outcome.success,
    retryAfterSeconds: Math.max(1, Math.ceil((outcome.reset - Date.now()) / 1000)),
    // Reaching this line means the decision came from per-instance memory:
    // either Upstash is not configured, or it was unreachable on a route that
    // tolerates degradation.
    degraded: true,
    ...(outcome.success ? {} : { reason: 'rate_limited' as const }),
  };
}

// ---------------------------------------------------------------------------
// Daily LLM cap
// ---------------------------------------------------------------------------

const dailyQuotaMemory = new Map<string, { count: number; day: string }>();

export interface QuotaResult {
  allowed: boolean;
  reason?: 'daily_cap' | 'quota_unavailable';
  degraded: boolean;
}

/** Atomically consume one unit of the daily LLM budget (YYYY-MM-DD UTC key). */
export async function consumeDailyLlmQuota(cap: number): Promise<QuotaResult> {
  const day = new Date().toISOString().slice(0, 10);
  const key = `cleanair:llm:daily:${day}`;

  if (!upstashConfigured()) {
    const bucket = dailyQuotaMemory.get(key);
    const count = (bucket?.day === day ? bucket.count : 0) + 1;
    dailyQuotaMemory.set(key, { count, day });
    return { allowed: count <= cap, degraded: true, ...(count <= cap ? {} : { reason: 'daily_cap' as const }) };
  }

  try {
    const redis = new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL as string,
      token: process.env.UPSTASH_REDIS_REST_TOKEN as string,
    });
    const count = await withTimeout(redis.incr(key));
    if (count === 1) await withTimeout(redis.expire(key, 60 * 60 * 26));
    if (count > cap) return { allowed: false, reason: 'daily_cap', degraded: false };
    return { allowed: true, degraded: false };
  } catch {
    // Fail closed: no quota accounting means no paid model call.
    return { allowed: false, reason: 'quota_unavailable', degraded: true };
  }
}

/** Test-only reset so unit tests are order-independent. */
export function __resetRateLimitState(): void {
  memoryLimiters.clear();
  redisLimiters.clear();
  dailyQuotaMemory.clear();
}
