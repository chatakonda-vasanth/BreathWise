import { RATE_LIMITS } from '@/lib/constants';
import { getClientIp } from '@/lib/clientIp';
import { errorResponse, jsonResponse, logEvent } from '@/lib/http';
import { enforceRateLimit } from '@/lib/rateLimit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/health
 *
 * Liveness only: the body is exactly `{"status":"ok"}`. No environment variable
 * names, no build/version string, no dependency or limiter details — a public
 * endpoint that described the deployment would be a reconnaissance aid.
 *
 * Security headers and `Cache-Control: no-store` come from `src/proxy.ts` (the
 * same per-request headers as every other route); the JSON headers are set by
 * `jsonResponse`.
 *
 * The route is rate limited like all the others and fails closed when the
 * limiter is unavailable, so a 200 here means the deployment can actually serve
 * API traffic. `/api/air` and `/api/geocode` answer 503 in exactly that
 * situation (see README "Deploy").
 */
export async function GET(request: Request): Promise<Response> {
  const started = Date.now();

  const limit = await enforceRateLimit({
    name: 'health',
    limit: RATE_LIMITS.health.limit,
    windowMs: RATE_LIMITS.health.windowMs,
    ip: getClientIp(new Headers(request.headers)),
  });
  if (!limit.ok) {
    const unavailable = limit.reason === 'limiter_unavailable';
    logEvent({
      route: '/api/health',
      status: unavailable ? 503 : 429,
      durationMs: Date.now() - started,
      outcome: limit.reason ?? 'rate_limited',
    });
    return errorResponse(unavailable ? 'service_unavailable' : 'rate_limited', {
      'Retry-After': String(limit.retryAfterSeconds),
    });
  }

  logEvent({ route: '/api/health', status: 200, durationMs: Date.now() - started });
  return jsonResponse({ status: 'ok' });
}
