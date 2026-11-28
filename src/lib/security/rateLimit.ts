import { resetMemoryLimiters } from './rate-limit/memory';
import { resetDailyQuota } from './rate-limit/quota';
import { resetWarnings } from './rate-limit/runtime';
import { resetRedisLimiters } from './rate-limit/upstash';

export type {
  EnforceOptions,
  EnforceResult,
  Limiter,
  LimitOutcome,
  QuotaResult,
} from './rate-limit/types';
export { MemoryLimiter } from './rate-limit/memory';
export {
  isProductionRuntime,
  upstashConfigured,
  warnMemoryLimiterOnce,
} from './rate-limit/runtime';
export { enforceRateLimit } from './rate-limit/enforce';
export { consumeDailyLlmQuota } from './rate-limit/quota';

/** Test-only reset so unit tests are order-independent. */
export function __resetRateLimitState(): void {
  resetMemoryLimiters();
  resetRedisLimiters();
  resetDailyQuota();
  resetWarnings();
}
