import type { Bucket, LimitOutcome, Limiter } from './types';

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


const memoryLimiters = new Map<string, MemoryLimiter>();

export function getMemoryLimiter(name: string, limit: number, windowMs: number): MemoryLimiter {
  const cacheKey = `${name}:${limit}:${windowMs}`;
  const existing = memoryLimiters.get(cacheKey);
  if (existing) return existing;
  const created = new MemoryLimiter(limit, windowMs);
  memoryLimiters.set(cacheKey, created);
  return created;
}


export function resetMemoryLimiters(): void {
  memoryLimiters.clear();
}
