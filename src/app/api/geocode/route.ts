import { geocodeCity } from '@/lib/air';
import { RATE_LIMITS } from '@/lib/constants';
import { errorResponse, getClientIp, jsonResponse, logEvent } from '@/lib/http';
import { enforceRateLimit } from '@/lib/rateLimit';
import { geocodeQuerySchema } from '@/lib/schemas';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** GET /api/geocode?q=city — allow-listed upstream, no user-supplied URL. */
export async function GET(request: Request): Promise<Response> {
  const started = Date.now();

  const limit = await enforceRateLimit({
    name: 'geocode',
    limit: RATE_LIMITS.geocode.limit,
    windowMs: RATE_LIMITS.geocode.windowMs,
    ip: getClientIp(new Headers(request.headers)),
    failClosed: false,
  });
  if (!limit.ok) {
    logEvent({ route: '/api/geocode', status: 429, durationMs: Date.now() - started });
    return errorResponse('rate_limited', { 'Retry-After': String(limit.retryAfterSeconds) });
  }

  const url = new URL(request.url);
  const raw: Record<string, string> = {};
  for (const [key, value] of url.searchParams) raw[key] = value;

  const query = geocodeQuerySchema.safeParse(raw);
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
