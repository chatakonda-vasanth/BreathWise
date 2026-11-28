export interface LimitOutcome {
  success: boolean;
  remaining: number;
  reset: number;
}

export interface Limiter {
  limit(key: string): Promise<LimitOutcome>;
}

export interface Bucket {
  count: number;
  resetAt: number;
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

export interface QuotaResult {
  allowed: boolean;
  reason?: 'daily_cap' | 'quota_unavailable';
  degraded: boolean;
}
