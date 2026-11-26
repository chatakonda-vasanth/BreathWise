import type { NextRequest } from 'next/server';
import { deriveIndices, getAirSnapshot, UpstreamError } from '@/lib/air';
import { withAirCache } from '@/lib/airCache';
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
  type ErrorCode,
} from '@/lib/http';
import { generateAnswer, type AnswerResult } from '@/lib/ask';
import { generatePlan, type PlanResult } from '@/lib/planService';
import { enforceRateLimit } from '@/lib/rateLimit';
import { planRequestSchema } from '@/lib/schemas';

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
  const headers = new Headers(request.headers);

  // 1. Same-origin only (no wildcard CORS anywhere). Done before the limiter so
  //    a cross-site form POST cannot burn the visitor's request budget, and so
  //    a rejected request costs no Upstash command.
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

  // 2. Rate limit and fail closed: this route can spend money.
  const limit = await enforceRateLimit({
    name: 'plan',
    limit: RATE_LIMITS.plan.limit,
    windowMs: RATE_LIMITS.plan.windowMs,
    ip: getClientIp(headers),
  });
  // A missing or unreachable limiter must never leave this route unlimited.
  // The app's purpose is to give a safe plan, so instead of an error the
  // request continues to the labelled rule-based plan with no model call.
  const limiterUnavailable = !limit.ok && limit.reason === 'limiter_unavailable';
  if (!limit.ok && !limiterUnavailable) {
    logEvent({
      route: '/api/plan',
      status: 429,
      durationMs: Date.now() - started,
      outcome: limit.reason ?? 'rate_limited',
    });
    return errorResponse('rate_limited', {
      'Retry-After': String(limit.retryAfterSeconds),
    });
  }

  // 3. Bounded, strict JSON body.
  const body = await readJsonBody(request, MAX_BODY_BYTES);
  if (!body.ok) {
    logEvent({ route: '/api/plan', status: 400, durationMs: Date.now() - started });
    return errorResponse(bodyErrorCode(body.reason));
  }

  const parsed = planRequestSchema.safeParse(body.value);
  if (!parsed.success) {
    logEvent({ route: '/api/plan', status: 400, durationMs: Date.now() - started });
    return errorResponse('invalid_input');
  }

  const { profile, lat, lon, sample, question } = parsed.data;

  // 4. Air data is fetched here, never accepted from the caller. The only
  //    exception is the explicit, clearly labelled demo mode.
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

  // 5a. A quick question is answered through the same guardrails and the same
  //     labelled fallback, with no free-text field anywhere in the request.
  if (question) {
    const answered = await generateAnswer({
      question,
      profile,
      snapshot,
      derived,
      severity: derived.severity,
      language: profile.language,
      ...(limiterUnavailable ? { fallbackOnly: 'limiter_unavailable' as const } : {}),
      budgetMs,
    });
    return logAndAnswer(answered, question, snapshot, derived, started);
  }

  // 5b. LLM or deterministic fallback. Never throws: failures fall back.
  const result = await generatePlan({
    profile,
    snapshot,
    derived,
    severity: derived.severity,
    naqi: derived.naqi,
    language: profile.language,
    // No rate limiting means no model call at all: the free tier cannot be
    // protected, so the paid path stays off until Upstash is reachable.
    ...(limiterUnavailable ? { fallbackOnly: 'limiter_unavailable' as const } : {}),
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
