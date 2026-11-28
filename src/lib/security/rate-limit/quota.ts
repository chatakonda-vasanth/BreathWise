import { QUOTA_KEY_TTL_SECONDS } from '@/lib/shared/constants';
import type { QuotaResult } from './types';
import { getRedis } from './upstash';
import { isProductionRuntime, upstashConfigured, withTimeout } from './runtime';

const dailyQuotaMemory = new Map<string, { count: number; day: string }>();

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
    if (count === 1) await withTimeout(redis.expire(key, QUOTA_KEY_TTL_SECONDS));
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


export function resetDailyQuota(): void {
  dailyQuotaMemory.clear();
}
