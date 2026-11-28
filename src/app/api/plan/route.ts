import type { NextRequest } from 'next/server';
import type { z } from 'zod';
import { deriveIndices, getAirSnapshot, UpstreamError } from '@/lib/air/air';
import { withAirCache } from '@/lib/air/airCache';
import { createSampleSnapshot } from '@/lib/air/sampleData';
import {
  FUNCTION_MAX_DURATION_S,
  MAX_BODY_BYTES,
  RATE_LIMITS,
  ROUTE_RESPONSE_MARGIN_MS,
} from '@/lib/shared/constants';
import { getClientIp } from '@/lib/security/clientIp';
import {
  checkOrigin,
  errorResponse,
  jsonResponse,
  logEvent,
  type ErrorCode,
} from '@/lib/shared/http';
import { readJsonBody } from '@/lib/security/requestBody';
import { generateAnswer, type AnswerResult } from '@/lib/ai/ask';
import { generatePlan, type PlanResult } from '@/lib/ai/planService';
import { enforceRateLimit } from '@/lib/security/rateLimit';
import { planRequestSchema } from '@/lib/shared/schemas';

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
type PlanRequest = z.infer<typeof planRequestSchema>;

/** A request that passed every gate, or the response that rejected it. */
type GateResult =
  | { ok: true; data: PlanRequest; limiterUnavailable: boolean }
  | { ok: false; response: Response };

/** Reject a cross-site request; this route can spend money. */
function originGate(request: NextRequest, started: number): Response | null {
  const origin = checkOrigin(request);
  if (origin.ok) return null;
  logEvent({
    route: '/api/plan',
    status: 403,
    durationMs: Date.now() - started,
    outcome: origin.reason ?? 'forbidden_origin',
  });
  return errorResponse('forbidden_origin');
}

/**
 * Rate-limit the request and fail closed: this route can spend money.
 *
 * A missing or unreachable limiter must never leave this route unlimited. The
 * app's purpose is to give a safe plan, so instead of an error the request
 * continues to the labelled rule-based plan with no model call.
 */
async function limitGate(
  request: NextRequest,
  started: number,
): Promise<{ response: Response } | { limiterUnavailable: boolean }> {
  const limit = await enforceRateLimit({
    name: 'plan',
    limit: RATE_LIMITS.plan.limit,
    windowMs: RATE_LIMITS.plan.windowMs,
    ip: getClientIp(new Headers(request.headers)),
  });
  if (limit.ok) return { limiterUnavailable: false };
  if (limit.reason === 'limiter_unavailable') return { limiterUnavailable: true };

  logEvent({
    route: '/api/plan',
    status: 429,
    durationMs: Date.now() - started,
    outcome: limit.reason ?? 'rate_limited',
  });
  return {
    response: errorResponse('rate_limited', {
      'Retry-After': String(limit.retryAfterSeconds),
    }),
  };
}

/** Bounded, strict JSON body: the only input this route accepts. */
async function bodyGate(request: NextRequest, started: number): Promise<GateResult> {
  const body = await readJsonBody(request, MAX_BODY_BYTES);
  if (!body.ok) {
    logEvent({ route: '/api/plan', status: 400, durationMs: Date.now() - started });
    return { ok: false, response: errorResponse(bodyErrorCode(body.reason)) };
  }

  const parsed = planRequestSchema.safeParse(body.value);
  if (!parsed.success) {
    logEvent({ route: '/api/plan', status: 400, durationMs: Date.now() - started });
    return { ok: false, response: errorResponse('invalid_input') };
  }

  return { ok: true, data: parsed.data, limiterUnavailable: false };
}

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

  // A quick question is answered through the same guardrails and the same
  // labelled fallback, with no free-text field anywhere in the request.
  if (question) {
    const answered = await generateAnswer({
      question,
      profile,
      snapshot,
      derived,
      severity: derived.severity,
      language: profile.language,
      ...(limit.limiterUnavailable
        ? { fallbackOnly: 'limiter_unavailable' as const }
        : {}),
      budgetMs,
    });
    return logAndAnswer(answered, question, snapshot, derived, started);
  }

  // LLM or deterministic fallback. Never throws: failures fall back.
  const result = await generatePlan({
    profile,
    snapshot,
    derived,
    severity: derived.severity,
    naqi: derived.naqi,
    language: profile.language,
    // No rate limiting means no model call at all: the free tier cannot be
    // protected, so the paid path stays off until Upstash is reachable.
    ...(limit.limiterUnavailable ? { fallbackOnly: 'limiter_unavailable' as const } : {}),
    // generatePlan clamps and never starts an attempt it cannot finish before
    // the deadline.
    budgetMs,
  });

  logEvent({
    route: '/api/plan',
    status: 200,
    durationMs: Date.now() - started,
    outcome: result.usedLlm ? 'llm' : `fallback:${result.reason ?? 'unknown'}`,
  });

  return jsonResponse(planResponseBody(result, snapshot, derived));
}

type Snapshot = Awaited<ReturnType<typeof getAirSnapshot>>;
type Derived = ReturnType<typeof deriveIndices>;

/** Map a body-read failure onto the client-facing error code. */
function bodyErrorCode(
  reason: 'too_large' | 'invalid_json' | 'unsupported_media_type',
): ErrorCode {
  if (reason === 'too_large') return 'body_too_large';
  if (reason === 'unsupported_media_type') return 'unsupported_media_type';
  return 'invalid_input';
}

/**
 * Fetch the air snapshot the plan is built on.
 *
 * Sample mode is the only path where the caller influences the data, and it is
 * labelled as sample in the response. Upstream failures come back as a status
 * instead of a throw so the caller logs and answers in one place.
 */
async function resolveSnapshot(
  sample: boolean | undefined,
  lat: number,
  lon: number,
): Promise<{ snapshot: Snapshot } | { failure: 500 | 502 }> {
  if (sample === true) return { snapshot: createSampleSnapshot() };
  try {
    // Same cache as /api/air: a plan requested seconds after the air screen
    // loads must not pay for a second upstream call.
    return { snapshot: await withAirCache(lat, lon, () => getAirSnapshot(lat, lon)) };
  } catch (error) {
    return { failure: error instanceof UpstreamError ? 502 : 500 };
  }
}

/** Response body: the plan plus the provenance the UI labels. */
function airProvenance(snapshot: Snapshot, derived: Derived) {
  return {
    lat: snapshot.lat,
    lon: snapshot.lon,
    timezone: snapshot.timezone,
    fetchedAt: snapshot.fetchedAt,
    usAqi: Math.round(derived.usAqi),
    naqi: Math.round(derived.naqi.value),
    pm25: snapshot.current.pm25,
    severity: derived.severity,
    sample: snapshot.isSample,
  };
}

function planResponseBody(result: PlanResult, snapshot: Snapshot, derived: Derived) {
  return {
    plan: result.plan,
    air: airProvenance(snapshot, derived),
    meta: {
      generatedBy: result.plan.generatedBy,
      ...(result.reason ? { fallbackReason: result.reason } : {}),
      cacheable: false,
    },
  };
}

/**
 * Log and return one answered question. Split out of `POST` so the route reads
 * as a sequence of checks and the branch budget stays readable.
 */
function logAndAnswer(
  answered: AnswerResult,
  question: string,
  snapshot: Snapshot,
  derived: Derived,
  started: number,
): Response {
  logEvent({
    route: '/api/plan',
    status: 200,
    durationMs: Date.now() - started,
    outcome: answered.usedLlm
      ? `answer:llm:${question}`
      : `answer:fallback:${answered.reason ?? 'unknown'}`,
  });
  return jsonResponse(answerResponseBody(answered, snapshot, derived));
}

/** Response body for a quick question: the answer plus the same provenance. */
function answerResponseBody(result: AnswerResult, snapshot: Snapshot, derived: Derived) {
  return {
    answer: result.answer,
    air: airProvenance(snapshot, derived),
    meta: {
      generatedBy: result.answer.generatedBy,
      ...(result.reason ? { fallbackReason: result.reason } : {}),
      cacheable: false,
    },
  };
}

/** Explicitly no CORS: browsers may only call this from the same origin. */
export function OPTIONS(): Response {
  return errorResponse('forbidden_origin');
}
