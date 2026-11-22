import type { DerivedIndices } from './air';
import {
  DEFAULT_DAILY_LLM_CAP,
  LLM_ATTEMPT_TIMEOUT_MS,
  LLM_RETRY_MIN_REMAINING_MS,
  LLM_TOTAL_BUDGET_MS,
} from './constants';
import { readEnv } from './env';
import { medicalAlertFor, buildFallbackPlan, type FallbackReason } from './fallbackPlan';
import { LlmError, callGemini, parseJsonText } from './gemini';
import { sanitizePlan, looksLikeMedicalAdvice, scriptMatches } from './sanitize';
import { llmPlanSchema } from './schemas';
import { SYSTEM_INSTRUCTION, buildUserPrompt } from './prompt';
import { consumeDailyLlmQuota } from './rateLimit';
import type { AirSnapshot, Language, Plan } from './types';
import type { Profile } from './schemas';
import type { NaqiResult } from './naqi';
import type { SeverityBand } from './types';

/**
 * Plan orchestration: LLM with strict validation and a deterministic fallback
 * on every failure path (disabled, no key, timeout, upstream error, rate limit,
 * quota, invalid JSON, schema failure, unsafe content, wrong script).
 */

export interface GeneratePlanArgs {
  profile: Profile;
  snapshot: AirSnapshot;
  derived: DerivedIndices;
  severity: SeverityBand;
  naqi: NaqiResult;
  language: Language;
  /**
   * Milliseconds left before the route must stop talking to the model (its
   * wall-clock deadline minus the response margin). Defaults to the full LLM
   * budget. Clamped, and a value <= 0 skips the model entirely.
   */
  budgetMs?: number;
  /**
   * Return this labelled fallback without touching the model or the daily
   * quota. Used when a precondition fails (for example, no shared rate
   * limiter), so the route can still answer with a real plan.
   */
  fallbackOnly?: FallbackReason;
}

function dailyCap(): number {
  const parsed = Number(readEnv('DAILY_LLM_CAP') ?? '');
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : DEFAULT_DAILY_LLM_CAP;
}

export function llmDisabled(): boolean {
  return readEnv('LLM_DISABLED')?.trim().toLowerCase() === 'true';
}

/**
 * Per-attempt cap. An operator (or a test) can lower it with
 * `LLM_ATTEMPT_TIMEOUT_MS`; it can never be raised above the built-in value, so
 * no configuration can make one attempt outlive the function budget.
 */
export function attemptTimeoutMs(): number {
  const parsed = Number(readEnv('LLM_ATTEMPT_TIMEOUT_MS') ?? '');
  if (!Number.isFinite(parsed) || parsed <= 0) return LLM_ATTEMPT_TIMEOUT_MS;
  return Math.max(1, Math.min(Math.floor(parsed), LLM_ATTEMPT_TIMEOUT_MS));
}

function fallback(
  args: GeneratePlanArgs,
  reason: FallbackReason,
): Plan {
  return buildFallbackPlan({
    snapshot: args.snapshot,
    profile: args.profile,
    language: args.language,
    severity: args.severity,
    naqiBand: args.naqi.band,
    reason,
  });
}

interface ValidationOutcome {
  ok: boolean;
  reason?: FallbackReason;
  plan?: Plan;
}

function validateModelOutput(raw: string, args: GeneratePlanArgs): ValidationOutcome {
  let parsed: unknown;
  try {
    parsed = parseJsonText(raw);
  } catch {
    return { ok: false, reason: 'invalid_output' };
  }

  const result = llmPlanSchema.safeParse(parsed);
  if (!result.success) return { ok: false, reason: 'invalid_output' };

  const data = result.data;
  const joined = [
    data.headline,
    data.whatThisMeans,
    data.cigaretteEquivalentNote,
    data.bestTimeToGoOut,
    data.maskGuidance,
    data.schoolAndCommute,
    data.exerciseTiming,
    ...data.indoorHacks.flatMap((item) => [item.title, item.detail, item.impact.mechanism]),
    ...data.sustainableAlternatives.flatMap((item) => [
      item.title,
      item.detail,
      item.impact.mechanism,
    ]),
  ].join('\n');

  // Medical safety: refuse dosage/diagnosis content regardless of the prompt.
  if (looksLikeMedicalAdvice(joined)) return { ok: false, reason: 'medical_content' };

  // Language contract: Hindi/Telugu output must actually be in that script.
  const languageSample = [
    data.headline,
    data.whatThisMeans,
    data.bestTimeToGoOut,
    ...data.indoorHacks.map((item) => item.detail),
  ].join(' ');
  if (!scriptMatches(args.language, languageSample)) {
    return { ok: false, reason: 'lang_mismatch' };
  }

  const plan: Plan = {
    language: args.language,
    severity: args.severity,
    headline: data.headline,
    whatThisMeans: {
      text: data.whatThisMeans,
      cigaretteEquivalent: data.cigaretteEquivalentNote,
      assumption:
        'Model-stated: cigarette-equivalence assumes about 22 µg/m³ of PM2.5 equals one cigarette a day, a rough approximation only.',
    },
    bestTimeToGoOut: data.bestTimeToGoOut,
    maskGuidance: data.maskGuidance,
    schoolAndCommute: data.schoolAndCommute,
    exerciseTiming: data.exerciseTiming,
    indoorHacks: data.indoorHacks,
    sustainableAlternatives: data.sustainableAlternatives,
    // Never trust the model on this: recomputed from our own severity data.
    medicalAlert: medicalAlertFor(
      args.language,
      args.severity,
      args.naqi.band,
      args.profile.symptoms,
    ),
    generatedBy: 'llm',
  };

  return { ok: true, plan: sanitizePlan(plan) };
}

export interface PlanResult {
  plan: Plan;
  usedLlm: boolean;
  reason?: FallbackReason;
}

export async function generatePlan(args: GeneratePlanArgs): Promise<PlanResult> {
  if (args.fallbackOnly) {
    return {
      plan: fallback(args, args.fallbackOnly),
      usedLlm: false,
      reason: args.fallbackOnly,
    };
  }

  if (llmDisabled()) {
    return { plan: fallback(args, 'llm_disabled'), usedLlm: false, reason: 'llm_disabled' };
  }

  const apiKey = readEnv('GEMINI_API_KEY')?.trim();
  if (!apiKey) {
    return { plan: fallback(args, 'no_api_key'), usedLlm: false, reason: 'no_api_key' };
  }

  const quota = await consumeDailyLlmQuota(dailyCap());
  if (!quota.allowed) {
    const reason: FallbackReason =
      quota.reason === 'daily_cap' ? 'daily_cap' : 'quota_unavailable';
    return { plan: fallback(args, reason), usedLlm: false, reason };
  }

  const system = SYSTEM_INSTRUCTION;
  const user = buildUserPrompt({
    profile: args.profile,
    snapshot: args.snapshot,
    derived: args.derived,
    language: args.language,
    severity: args.severity,
  });

  // Wall-clock budget shared by every attempt. No attempt is started that could
  // run past the deadline, and a first attempt slower than half the budget ends
  // the loop: two attempts would no longer both fit, so the caller gets the
  // labelled fallback instead of a platform timeout.
  const budgetMs = Math.max(0, Math.min(args.budgetMs ?? LLM_TOTAL_BUDGET_MS, LLM_TOTAL_BUDGET_MS));
  const deadline = Date.now() + budgetMs;
  const retryThresholdMs = budgetMs / 2;
  // A retry needs a meaningful slice of time left; the floor never eats more
  // than a quarter of a short budget, so a smaller configured budget still
  // retries proportionally instead of never.
  const minRetryMs = Math.min(LLM_RETRY_MIN_REMAINING_MS, budgetMs / 4);
  const attemptCapMs = attemptTimeoutMs();

  // 'timeout' is the honest reason if the budget is gone before any attempt can
  // start (for example after a slow air fetch).
  let lastReason: FallbackReason = 'timeout';

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const remainingMs = deadline - Date.now();
    // The first attempt runs with whatever is left (the timeout below is capped
    // by it); a retry needs enough room to be worth starting.
    if (remainingMs < (attempt === 0 ? 1 : minRetryMs)) break;

    const attemptStarted = Date.now();
    try {
      const raw = await callGemini({
        system,
        user,
        apiKey,
        timeoutMs: Math.min(attemptCapMs, remainingMs),
      });
      const outcome = validateModelOutput(raw, args);
      if (outcome.ok && outcome.plan) {
        return { plan: outcome.plan, usedLlm: true };
      }
      lastReason = outcome.reason ?? 'invalid_output';
      // A script or safety failure will not improve on retry; a schema failure might.
      if (lastReason === 'medical_content' || lastReason === 'lang_mismatch') break;
    } catch (error) {
      if (error instanceof LlmError) {
        lastReason =
          error.code === 'timeout'
            ? 'timeout'
            : error.code === 'rate_limited'
              ? 'rate_limited'
              : error.code === 'no_api_key'
                ? 'no_api_key'
                : error.code === 'invalid_output'
                  ? 'invalid_output'
                  : 'upstream_error';
        // Transport failures are retried once; a timeout, an invalid key or a
        // rate limit will not improve by immediately asking again, and a retry
        // after a timeout would hold the request for twice the LLM budget.
        if (
          error.code === 'no_api_key' ||
          error.code === 'timeout' ||
          error.code === 'rate_limited'
        ) {
          break;
        }
      } else {
        lastReason = 'unknown';
      }
    }

    // Budget check for the retry: only a first attempt that finished inside half
    // the budget leaves room for a second one that still ends before the
    // deadline. A slower first attempt falls back immediately.
    if (Date.now() - attemptStarted >= retryThresholdMs) break;
  }

  return { plan: fallback(args, lastReason), usedLlm: false, reason: lastReason };
}
