import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';
import { readEnv } from '@/lib/shared/env';
import { hashIp } from './clientIp';

/**
 * Rate limiting and the daily LLM cap.
 *
 * Production **requires** Upstash: serverless instances do not share memory, so
 * a per-instance map would leave every route effectively unlimited. When the
 * Upstash variables are missing, or the limiter cannot be reached, every route
 * fails closed — never open. `/api/plan` answers with the labelled rule-based
 * plan (HTTP 200) and never calls the model; `/api/air` and `/api/geocode`
 * answer 503.
 *
 * Development (and the test runner) may use the in-memory limiter, which prints
 * one visible warning at startup. That warning is deliberately loud because the
 * same configuration in production would be unsafe.
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

  /**
   * The limiter interface is async because the shared (Upstash) one is; the
   * in-memory fallback is synchronous, so it wraps its result rather than
   * declaring `async` without awaiting anything.
   */
  limit(key: string): Promise<LimitOutcome> {
    const now = this.now();
    const existing = this.buckets.get(key);

    if (!existing || existing.resetAt <= now) {
      const resetAt = now + this.windowMs;
      this.buckets.set(key, { count: 1, resetAt });
      this.sweep(now);
      return Promise.resolve({
        success: true,
        remaining: this.limitCount - 1,
        reset: resetAt,
      });
    }

    if (existing.count >= this.limitCount) {
      return Promise.resolve({ success: false, remaining: 0, reset: existing.resetAt });
    }
    existing.count += 1;
    return Promise.resolve({
      success: true,
      remaining: this.limitCount - existing.count,
      reset: existing.resetAt,
    });
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

/** True only for a real production build; `test` and `development` are not. */
export function isProductionRuntime(): boolean {
  return process.env.NODE_ENV === 'production';
}

/**
 * Whether both Upstash variables are
 * present and non-blank. Does not prove the limiter is reachable.
 */
export function upstashConfigured(): boolean {
  return Boolean(
    readEnv('UPSTASH_REDIS_REST_URL')?.trim() &&
    readEnv('UPSTASH_REDIS_REST_TOKEN')?.trim(),
  );
}

const warned = new Set<string>();

function warnOnce(id: string, message: string): void {
  if (warned.has(id)) return;
  warned.add(id);
  console.warn(message);
}

/**
 * One visible development warning about the per-instance fallback. Called from
 * the startup check and, defensively, the first time a request falls back.
 */
export function warnMemoryLimiterOnce(): void {
  warnOnce(
    'memory-limiter',
    '[cleanair] development warning: UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN ' +
      'are not set, so the per-instance in-memory rate limiter is in use. It does not ' +
      'survive a restart and is not shared between serverless instances. Production ' +
      'refuses to serve without Upstash instead.',
  );
}

const redisLimiters = new Map<string, Limiter>();

/** Shared Redis client so limiter calls reuse one connection pool. */
let redisClient: Redis | null = null;

function getRedis(): Redis | null {
  if (!upstashConfigured()) return null;
  if (!redisClient) {
    redisClient = new Redis({
      url: readEnv('UPSTASH_REDIS_REST_URL') ?? '',
      token: readEnv('UPSTASH_REDIS_REST_TOKEN') ?? '',
    });
  }
  return redisClient;
}

function getRedisLimiter(name: string, limit: number, windowMs: number): Limiter | null {
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
}

export interface EnforceResult {
  ok: boolean;
  retryAfterSeconds: number;
  /** True when the decision came from the per-instance memory limiter. */
  degraded: boolean;
  reason?: 'rate_limited' | 'limiter_unavailable';
}

/** Fail closed: no shared limiter means no verified allowance. */
function limiterUnavailable(): EnforceResult {
  return {
    ok: false,
    retryAfterSeconds: 30,
    degraded: false,
    reason: 'limiter_unavailable',
  };
}

/**
 * Consume one token from the named limit
 * for this IP and return whether the request may proceed.
 * Fails closed: a missing or unreachable limiter returns
 * "limiter_unavailable" rather than allowing an unmetered request.
 */
export async function enforceRateLimit(options: EnforceOptions): Promise<EnforceResult> {
  const key = hashIp(options.ip);
  const production = isProductionRuntime();
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
      // Production: an unreachable limiter can never mean "allow". Development:
      // fall through to the per-instance map so local work is not blocked.
      if (production) return limiterUnavailable();
      if (process.env.NODE_ENV === 'development') {
        warnOnce(
          'limiter-unreachable',
          '[cleanair] development warning: the Upstash limiter is unreachable. ' +
            'Using the per-instance in-memory limiter for this request; production ' +
            'fails closed instead.',
        );
      }
    }
  } else {
    if (production) return limiterUnavailable();
    if (process.env.NODE_ENV === 'development') warnMemoryLimiterOnce();
  }

  const memory = getMemoryLimiter(options.name, options.limit, options.windowMs);
  const outcome = await memory.limit(key);
  return {
    ok: outcome.success,
    retryAfterSeconds: Math.max(1, Math.ceil((outcome.reset - Date.now()) / 1000)),
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

/**
 * Atomically consume one unit of the daily LLM budget (YYYY-MM-DD UTC key).
 *
 * The cap is a spend control, so it is strict: without shared accounting in
 * production no model call is allowed at all.
 */
/** Per-instance counter, used outside production only. */
function consumeMemoryQuota(key: string, day: string, cap: number): QuotaResult {
  const bucket = dailyQuotaMemory.get(key);
  const count = (bucket?.day === day ? bucket.count : 0) + 1;
  dailyQuotaMemory.set(key, { count, day });
  return {
    allowed: count <= cap,
    degraded: true,
    ...(count <= cap ? {} : { reason: 'daily_cap' as const }),
  };
}

/** Shared, atomic counter in Redis. Fails closed on any error. */
async function consumeRedisQuota(key: string, cap: number): Promise<QuotaResult> {
  try {
    const redis = getRedis();
    /* istanbul ignore next -- non-null whenever Upstash is configured */
    if (!redis) return { allowed: false, reason: 'quota_unavailable', degraded: true };
    const count = await withTimeout(redis.incr(key));
    if (count === 1) await withTimeout(redis.expire(key, 60 * 60 * 26));
    if (count > cap) return { allowed: false, reason: 'daily_cap', degraded: false };
    return { allowed: true, degraded: false };
  } catch {
    // Fail closed: no quota accounting means no paid model call.
    return { allowed: false, reason: 'quota_unavailable', degraded: true };
  }
}

/**
 * Atomically consume one unit of the daily LLM budget (YYYY-MM-DD UTC key).
 *
 * @param cap Maximum model generations allowed per UTC day.
 * @returns Whether the call may proceed; production refuses without shared
 * accounting because the cap is a spend control.
 */
export async function consumeDailyLlmQuota(cap: number): Promise<QuotaResult> {
  const day = new Date().toISOString().slice(0, 10);
  const key = `cleanair:llm:daily:${day}`;

  if (!upstashConfigured()) {
    if (isProductionRuntime()) {
      return { allowed: false, reason: 'quota_unavailable', degraded: true };
    }
    return consumeMemoryQuota(key, day, cap);
  }

  return consumeRedisQuota(key, cap);
}

/** Test-only reset so unit tests are order-independent. */
export function __resetRateLimitState(): void {
  memoryLimiters.clear();
  redisLimiters.clear();
  redisClient = null;
  dailyQuotaMemory.clear();
  warned.clear();
}
