import { geocodeCity } from '@/lib/air/air';
import { RATE_LIMITS } from '@/lib/shared/constants';
import { getClientIp } from '@/lib/security/clientIp';
import { errorResponse, jsonResponse, logEvent } from '@/lib/shared/http';
import { enforceRateLimit } from '@/lib/security/rateLimit';
import { geocodeQuerySchema } from '@/lib/shared/schemas';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** GET /api/geocode?q=city — allow-listed upstream, no user-supplied URL. */
export async function GET(request: Request): Promise<Response> {
  const started = Date.now();
  const rejected = await limitRejection(request, started);
  if (rejected) return rejected;

  const query = geocodeQuerySchema.safeParse(queryObject(request));
  if (!query.success) {
    logEvent({ route: '/api/geocode', status: 400, durationMs: Date.now() - started });
    return errorResponse('invalid_input');
  }

  try {
    const results = await geocodeCity(query.data.q);
    logEvent({ route: '/api/geocode', status: 200, durationMs: Date.now() - started });
    return jsonResponse({ results });
  } catch {
    logEvent({
      route: '/api/geocode',
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
    name: 'geocode',
    limit: RATE_LIMITS.geocode.limit,
    windowMs: RATE_LIMITS.geocode.windowMs,
    ip: getClientIp(new Headers(request.headers)),
  });
  if (limit.ok) return null;
  const unavailable = limit.reason === 'limiter_unavailable';
  logEvent({
    route: '/api/geocode',
    status: unavailable ? 503 : 429,
    durationMs: Date.now() - started,
    outcome: limit.reason ?? 'rate_limited',
  });
  return errorResponse(unavailable ? 'service_unavailable' : 'rate_limited', {
    'Retry-After': String(limit.retryAfterSeconds),
  });
}
