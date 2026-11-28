import { hashIp } from '../clientIp';
import { getMemoryLimiter } from './memory';
import { getRedisLimiter } from './upstash';
import { isProductionRuntime, warnMemoryLimiterOnce, warnOnce, withTimeout } from './runtime';
import type { EnforceOptions, EnforceResult } from './types';

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
