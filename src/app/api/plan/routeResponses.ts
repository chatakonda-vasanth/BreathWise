import { getAirSnapshot, UpstreamError } from '@/lib/air/air';
import type { deriveIndices } from '@/lib/air/air';
import { withAirCache } from '@/lib/air/airCache';
import { createSampleSnapshot } from '@/lib/air/sampleData';
import { generateAnswer, type AnswerResult } from '@/lib/ai/ask';
import { generatePlan, type PlanResult } from '@/lib/ai/planService';
import { jsonResponse, logEvent } from '@/lib/shared/http';
import type { AskQuestion } from '@/lib/ai/askQuestions';
import type { Profile } from '@/lib/shared/schemas';

type Snapshot = Awaited<ReturnType<typeof getAirSnapshot>>;
type Derived = ReturnType<typeof deriveIndices>;

/**
 * Fetch the air snapshot the plan is built on.
 *
 * Sample mode is the only path where the caller influences the data, and it is
 * labelled as sample in the response. Upstream failures come back as a status
 * instead of a throw so the caller logs and answers in one place.
 */
export async function resolveSnapshot(
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

export interface ResponseArgs {
  profile: Profile;
  snapshot: Snapshot;
  derived: Derived;
  limiterUnavailable: boolean;
  budgetMs: number;
  started: number;
}

/** Answer one fixed question through the same guardrails as the plan path. */
export async function respondWithAnswer(
  args: ResponseArgs & { question: AskQuestion },
): Promise<Response> {
  const answered = await generateAnswer({
    question: args.question,
    profile: args.profile,
    snapshot: args.snapshot,
    derived: args.derived,
    severity: args.derived.severity,
    language: args.profile.language,
    ...(args.limiterUnavailable
      ? { fallbackOnly: 'limiter_unavailable' }
      : {}),
    budgetMs: args.budgetMs,
  });
  return logAndAnswer(answered, args.question, args.snapshot, args.derived, args.started);
}

/** Generate the plan, never throwing: failures fall back and are labelled. */
export async function respondWithPlan(args: ResponseArgs): Promise<Response> {
  const result = await generatePlan({
    profile: args.profile,
    snapshot: args.snapshot,
    derived: args.derived,
    severity: args.derived.severity,
    naqi: args.derived.naqi,
    language: args.profile.language,
    // No rate limiting means no model call at all: the free tier cannot be
    // protected, so the paid path stays off until Upstash is reachable.
    ...(args.limiterUnavailable ? { fallbackOnly: 'limiter_unavailable' as const } : {}),
    // generatePlan clamps and never starts an attempt it cannot finish before
    // the deadline.
    budgetMs: args.budgetMs,
  });

  logEvent({
    route: '/api/plan',
    status: 200,
    durationMs: Date.now() - args.started,
    outcome: result.usedLlm ? 'llm' : `fallback:${result.reason ?? 'unknown'}`,
  });

  return jsonResponse(planResponseBody(result, args.snapshot, args.derived));
}
