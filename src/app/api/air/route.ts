import { deriveIndices, getAirSnapshot } from '@/lib/air/air';
import { withAirCache } from '@/lib/air/airCache';
import { RATE_LIMITS } from '@/lib/shared/constants';
import { getClientIp } from '@/lib/security/clientIp';
import { errorResponse, jsonResponse, logEvent } from '@/lib/shared/http';
import { enforceRateLimit } from '@/lib/security/rateLimit';
import { airQuerySchema } from '@/lib/shared/schemas';

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
  const rejected = await limitRejection(request, started);
  if (rejected) return rejected;

  const query = airQuerySchema.safeParse(queryObject(request));
  if (!query.success) {
    logEvent({ route: '/api/air', status: 400, durationMs: Date.now() - started });
    return errorResponse('invalid_input');
  }

  try {
    const air = await withAirCache(query.data.lat, query.data.lon, () =>
      getAirSnapshot(query.data.lat, query.data.lon),
    );
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

/** Query string as a plain object (the schema rejects unknown keys). */
function queryObject(request: Request): Record<string, string> {
  const raw: Record<string, string> = {};
  for (const [key, value] of new URL(request.url).searchParams) raw[key] = value;
  return raw;
}

/** The shared 429/503 response, or null when the request may proceed. */
async function limitRejection(request: Request, started: number): Promise<Response | null> {
  const limit = await enforceRateLimit({
    name: 'air',
    limit: RATE_LIMITS.air.limit,
    windowMs: RATE_LIMITS.air.windowMs,
    ip: getClientIp(new Headers(request.headers)),
  });
  if (limit.ok) return null;
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
