import { readEnv } from '@/lib/shared/env';

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

export function warnOnce(id: string, message: string): void {
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

export function withTimeout<T>(promise: Promise<T>, ms = 1500): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => {
      const timer = setTimeout(() => reject(new Error('limiter_timeout')), ms);
      // Do not keep the process alive for the timer alone.
      (timer as unknown as { unref?: () => void }).unref?.();
    }),
  ]);
}

export function resetWarnings(): void {
  warned.clear();
}
