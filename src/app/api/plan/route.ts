import type { NextRequest } from 'next/server';
import { deriveIndices, getAirSnapshot, UpstreamError } from '@/lib/air';
import { createSampleSnapshot } from '@/lib/sampleData';
import {
  FUNCTION_MAX_DURATION_S,
  MAX_BODY_BYTES,
  RATE_LIMITS,
  ROUTE_RESPONSE_MARGIN_MS,
} from '@/lib/constants';
import {
  checkOrigin,
  errorResponse,
  getClientIp,
  jsonResponse,
  logEvent,
  readJsonBody,
} from '@/lib/http';
import { generatePlan } from '@/lib/planService';
import { enforceRateLimit } from '@/lib/rateLimit';
import { planRequestSchema } from '@/lib/schemas';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
/**
 * Explicit platform budget. Vercel's Hobby maximum is 300 s; this route needs a
 * small fraction of it and the LLM is budgeted to finish well inside it (see
 * constants.ts and the README), so a slow model returns the labelled fallback
 * instead of a 504 from the platform.
 */
export const maxDuration = FUNCTION_MAX_DURATION_S;

/**
 * POST /api/plan
 *
 * The only body accepted is the validated structured profile plus coordinates.
 * The air snapshot used for the prompt is always re-fetched server-side, so a
 * caller cannot inject invented air data or free text into the model.
 */
export async function POST(request: NextRequest): Promise<Response> {
  const started = Date.now();
  const headers = new Headers(request.headers);

  // 1. Rate limit first and fail closed: this route can spend money.
  const limit = await enforceRateLimit({
    name: 'plan',
    limit: RATE_LIMITS.plan.limit,
    windowMs: RATE_LIMITS.plan.windowMs,
    ip: getClientIp(headers),
    failClosed: true,
  });
  if (!limit.ok) {
    logEvent({
      route: '/api/plan',
      status: 429,
      durationMs: Date.now() - started,
      outcome: limit.reason ?? 'rate_limited',
    });
    return errorResponse('rate_limited', { 'Retry-After': String(limit.retryAfterSeconds) });
  }

  // 2. Same-origin only (no wildcard CORS anywhere).
  const origin = checkOrigin(request);
  if (!origin.ok) {
    logEvent({
      route: '/api/plan',
      status: 403,
      durationMs: Date.now() - started,
      outcome: origin.reason ?? 'forbidden_origin',
    });
    return errorResponse('forbidden_origin');
  }

  // 3. Bounded, strict JSON body.
  const body = await readJsonBody(request, MAX_BODY_BYTES);
  if (!body.ok) {
    const code =
      body.reason === 'too_large'
        ? 'body_too_large'
        : body.reason === 'unsupported_media_type'
          ? 'unsupported_media_type'
          : 'invalid_input';
    logEvent({ route: '/api/plan', status: 400, durationMs: Date.now() - started });
    return errorResponse(code);
  }

  const parsed = planRequestSchema.safeParse(body.value);
  if (!parsed.success) {
    logEvent({ route: '/api/plan', status: 400, durationMs: Date.now() - started });
    return errorResponse('invalid_input');
  }

  const { profile, lat, lon, sample } = parsed.data;

  // 4. Air data is fetched here, never accepted from the caller. The only
  //    exception is the explicit, clearly labelled demo mode.
  let snapshot;
  if (sample === true) {
    snapshot = createSampleSnapshot();
  } else {
    try {
      snapshot = await getAirSnapshot(lat, lon);
    } catch (error) {
      const status = error instanceof UpstreamError ? 502 : 500;
      logEvent({
        route: '/api/plan',
        status,
        durationMs: Date.now() - started,
        outcome: 'upstream_unavailable',
      });
      return errorResponse('upstream_unavailable');
    }
  }

  const derived = deriveIndices(snapshot);

  // 5. LLM or deterministic fallback. Never throws: failures fall back.
  const result = await generatePlan({
    profile,
    snapshot,
    derived,
    severity: derived.severity,
    naqi: derived.naqi,
    language: profile.language,
    // Hand the model only what is left of the function's wall clock, minus the
    // margin needed to write the response. generatePlan clamps and never starts
    // an attempt it cannot finish before the deadline.
    budgetMs:
      FUNCTION_MAX_DURATION_S * 1000 - ROUTE_RESPONSE_MARGIN_MS - (Date.now() - started),
  });

  logEvent({
    route: '/api/plan',
    status: 200,
    durationMs: Date.now() - started,
    outcome: result.usedLlm ? 'llm' : `fallback:${result.reason ?? 'unknown'}`,
  });

  return jsonResponse({
    plan: result.plan,
    air: {
      lat: snapshot.lat,
      lon: snapshot.lon,
      timezone: snapshot.timezone,
      fetchedAt: snapshot.fetchedAt,
      usAqi: Math.round(derived.usAqi),
      naqi: Math.round(derived.naqi.value),
      pm25: snapshot.current.pm25,
      severity: derived.severity,
      sample: snapshot.isSample,
    },
    meta: {
      generatedBy: result.plan.generatedBy,
      ...(result.reason ? { fallbackReason: result.reason } : {}),
      cacheable: false,
    },
  });
}

/** Explicitly no CORS: browsers may only call this from the same origin. */
export async function OPTIONS(): Promise<Response> {
  return errorResponse('forbidden_origin');
}
