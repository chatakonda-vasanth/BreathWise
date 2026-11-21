import { deriveIndices, getAirSnapshot } from '@/lib/air';
import { RATE_LIMITS } from '@/lib/constants';
import { errorResponse, getClientIp, jsonResponse, logEvent } from '@/lib/http';
import { enforceRateLimit } from '@/lib/rateLimit';
import { airQuerySchema } from '@/lib/schemas';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/air?lat=..&lon=..
 * Live air data for rounded coordinates. Cache: 10 minutes, server-side.
 * All validation, origin-independent (read-only) and rate limiting happen here,
 * not only in the proxy.
 */
export async function GET(request: Request): Promise<Response> {
  const started = Date.now();

  const ip = getClientIp(new Headers(request.headers));
  const limit = await enforceRateLimit({
    name: 'air',
    limit: RATE_LIMITS.air.limit,
    windowMs: RATE_LIMITS.air.windowMs,
    ip,
  });
  if (!limit.ok) {
    // Never leave a route unlimited: without a shared limiter there is no
    // verified allowance, so answer 503 with a generic message.
    const unavailable = limit.reason === 'limiter_unavailable';
    logEvent({
      route: '/api/air',
      status: unavailable ? 503 : 429,
      durationMs: Date.now() - started,
      outcome: limit.reason ?? 'rate_limited',
    });
    return errorResponse(unavailable ? 'service_unavailable' : 'rate_limited', {
      'Retry-After': String(limit.retryAfterSeconds),
    });
  }

  const url = new URL(request.url);
  const raw: Record<string, string> = {};
  for (const [key, value] of url.searchParams) raw[key] = value;

  const query = airQuerySchema.safeParse(raw);
  if (!query.success) {
    logEvent({ route: '/api/air', status: 400, durationMs: Date.now() - started });
    return errorResponse('invalid_input');
  }

  try {
    const air = await getAirSnapshot(query.data.lat, query.data.lon);
    const indices = deriveIndices(air);
    logEvent({ route: '/api/air', status: 200, durationMs: Date.now() - started });
    return jsonResponse({ air, indices });
  } catch {
    // Generic message only: upstream bodies and stack traces stay server-side.
    logEvent({
      route: '/api/air',
      status: 502,
      durationMs: Date.now() - started,
      outcome: 'upstream_unavailable',
    });
    return errorResponse('upstream_unavailable');
  }
}
