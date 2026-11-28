import type { NextRequest } from 'next/server';
import { deriveIndices } from '@/lib/air/air';
import {
  FUNCTION_MAX_DURATION_S,
  ROUTE_RESPONSE_MARGIN_MS,
} from '@/lib/shared/constants';
import { errorResponse, logEvent } from '@/lib/shared/http';
import { bodyGate, limitGate, originGate } from './routeGates';
import { resolveSnapshot, respondWithAnswer, respondWithPlan } from './routeResponses';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
/**
 * Explicit platform budget. Vercel's Hobby maximum is 300 s; this route needs a
 * small fraction of it and the LLM is budgeted to finish well inside it (see
 * constants.ts and the README), so a slow model returns the labelled fallback
 * instead of a 504 from the platform.
 *
 * The value must be a literal: Next.js reads route segment config statically and
 * rejects an imported expression. `FUNCTION_MAX_DURATION_S` mirrors it for the
 * budget arithmetic, and `tests/unit/planRoute.test.ts` fails if they diverge.
 */
export const maxDuration = 45;

/**
 * POST /api/plan
 *
 * The only body accepted is the validated structured profile plus coordinates.
 * The air snapshot used for the prompt is always re-fetched server-side, so a
 * caller cannot inject invented air data or free text into the model.
 */
export async function POST(request: NextRequest): Promise<Response> {
  const started = Date.now();

  const rejectedOrigin = originGate(request, started);
  if (rejectedOrigin) return rejectedOrigin;

  const limit = await limitGate(request, started);
  if ('response' in limit) return limit.response;

  const gate = await bodyGate(request, started);
  if (!gate.ok) return gate.response;
  const { profile, lat, lon, sample, question } = gate.data;

  // Air data is fetched here, never accepted from the caller. The only
  // exception is the explicit, clearly labelled demo mode.
  const resolved = await resolveSnapshot(sample, lat, lon);
  if ('failure' in resolved) {
    logEvent({
      route: '/api/plan',
      status: resolved.failure,
      durationMs: Date.now() - started,
      outcome: 'upstream_unavailable',
    });
    return errorResponse('upstream_unavailable');
  }

  const snapshot = resolved.snapshot;
  const derived = deriveIndices(snapshot);
  // Hand the model only what is left of the function's wall clock, minus the
  // margin needed to write the response.
  const budgetMs =
    FUNCTION_MAX_DURATION_S * 1000 - ROUTE_RESPONSE_MARGIN_MS - (Date.now() - started);

  const args = {
    profile,
    snapshot,
    derived,
    limiterUnavailable: limit.limiterUnavailable,
    budgetMs,
    started,
  };
  return question ? respondWithAnswer({ ...args, question }) : respondWithPlan(args);
}

/** Explicitly no CORS: browsers may only call this from the same origin. */
export function OPTIONS(): Response {
  return errorResponse('forbidden_origin');
}
