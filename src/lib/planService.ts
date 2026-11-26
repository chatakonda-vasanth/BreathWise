import type { DerivedIndices } from './air';
import {
  DEFAULT_DAILY_LLM_CAP,
  LLM_ATTEMPT_TIMEOUT_MS,
  LLM_RETRY_MIN_REMAINING_MS,
  LLM_TOTAL_BUDGET_MS,
} from './constants';
import { readEnv } from './env';
import { buildFallbackPlan, type FallbackReason } from './fallbackPlan';
import { LlmError, callGemini } from './gemini';
import type { NaqiResult } from './naqi';
import { validateModelOutput } from './planValidation';
import { buildUserPrompt, SYSTEM_INSTRUCTION } from './prompt';
import { consumeDailyLlmQuota } from './rateLimit';
import type { Profile } from './schemas';
import type { AirSnapshot, Language, Plan, SeverityBand } from './types';

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

/** Daily model-generation cap from `DAILY_LLM_CAP`, or the default. */
export function dailyCap(): number {
  const parsed = Number(readEnv('DAILY_LLM_CAP') ?? '');
  return Number.isFinite(parsed) && parsed > 0
    ? Math.floor(parsed)
    : DEFAULT_DAILY_LLM_CAP;
}

/**
 * Kill switch and missing-key check for the AI path. When true no model call is
 * attempted and the labelled rule-based plan is returned.
 */
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

function fallback(args: GeneratePlanArgs, reason: FallbackReason): Plan {
  return buildFallbackPlan({
    snapshot: args.snapshot,
    profile: args.profile,
    language: args.language,
    severity: args.severity,
    naqiBand: args.naqi.band,
    reason,
  });
}

/** A finished plan with the provenance the UI labels. */
export interface PlanResult {
  plan: Plan;
  usedLlm: boolean;
  reason?: FallbackReason;
}

/** The labelled rule-based answer, with no model call. */
function fallbackResult(args: GeneratePlanArgs, reason: FallbackReason): PlanResult {
  return { plan: fallback(args, reason), usedLlm: false, reason };
}

interface PreflightBlocked {
  done: PlanResult;
}

interface PreflightReady {
  apiKey: string;
}

type Preflight = PreflightBlocked | PreflightReady;

/**
 * Every reason not to call the model, decided before any request is built.
 *
 * Assumption: the fallback is complete guidance on its own, so an AI outage
 * degrades detail, never safety.
 */
async function preflight(args: GeneratePlanArgs): Promise<Preflight> {
  if (args.fallbackOnly) return { done: fallbackResult(args, args.fallbackOnly) };
  if (llmDisabled()) return { done: fallbackResult(args, 'llm_disabled') };

  const apiKey = readEnv('GEMINI_API_KEY')?.trim();
  if (!apiKey) return { done: fallbackResult(args, 'no_api_key') };

  const quota = await consumeDailyLlmQuota(dailyCap());
  if (!quota.allowed) {
    const reason: FallbackReason =
      quota.reason === 'daily_cap' ? 'daily_cap' : 'quota_unavailable';
    return { done: fallbackResult(args, reason) };
  }

  return { apiKey };
}

/** The wall-clock budget every attempt shares, and the retry thresholds. */
interface Budget {
  deadline: number;
  retryThresholdMs: number;
  minRetryMs: number;
  attemptCapMs: number;
}

function budgetFor(args: GeneratePlanArgs): Budget {
  const budgetMs = Math.max(
    0,
    Math.min(args.budgetMs ?? LLM_TOTAL_BUDGET_MS, LLM_TOTAL_BUDGET_MS),
  );
  return {
    deadline: Date.now() + budgetMs,
    retryThresholdMs: budgetMs / 2,
    // A retry needs a meaningful slice of time left; the floor never eats more
    // than a quarter of a short budget, so a smaller configured budget still
    // retries proportionally instead of never.
    minRetryMs: Math.min(LLM_RETRY_MIN_REMAINING_MS, budgetMs / 4),
    attemptCapMs: attemptTimeoutMs(),
  };
}

interface AttemptResult {
  /** Set when the model produced a usable plan. */
  plan?: Plan;
  reason: FallbackReason;
  retryable: boolean;
}

/**
 * Map a thrown model failure onto a fallback reason and a retry decision.
 *
 * Transport failures are retried once; a timeout, an invalid key or a rate
 * limit will not improve by immediately asking again, and a retry after a
 * timeout would hold the request for twice the LLM budget.
 */
function failureFromError(error: unknown): AttemptResult {
  if (!(error instanceof LlmError)) return { reason: 'unknown', retryable: true };
  switch (error.code) {
    case 'timeout':
    case 'rate_limited':
    case 'no_api_key':
      return { reason: error.code, retryable: false };
    case 'invalid_output':
      return { reason: 'invalid_output', retryable: true };
    case 'upstream_error':
      return { reason: 'upstream_error', retryable: true };
  }
}

/**
 * One model attempt: call, validate, and classify the outcome.
 *
 * A script or safety failure will not improve on a retry; a schema failure or a
 * transport error might, which is what `retryable` carries back.
 */
async function attemptOnce(params: {
  args: GeneratePlanArgs;
  apiKey: string;
  user: string;
  timeoutMs: number;
}): Promise<AttemptResult> {
  try {
    const raw = await callGemini({
      system: SYSTEM_INSTRUCTION,
      user: params.user,
      apiKey: params.apiKey,
      timeoutMs: params.timeoutMs,
    });
    const outcome = validateModelOutput(raw, {
      language: params.args.language,
      severity: params.args.severity,
      naqiBand: params.args.naqi.band,
      symptoms: params.args.profile.symptoms,
    });
    if (outcome.ok && outcome.plan) {
      return { plan: outcome.plan, reason: 'unknown', retryable: true };
    }
    const reason = outcome.reason ?? 'invalid_output';
    const permanent = reason === 'medical_content' || reason === 'lang_mismatch';
    return { reason, retryable: !permanent };
  } catch (error) {
    return failureFromError(error);
  }
}

/** Prompt plus user turn, built once and reused by every attempt. */
function userTurn(args: GeneratePlanArgs): string {
  return buildUserPrompt({
    profile: args.profile,
    snapshot: args.snapshot,
    derived: args.derived,
    language: args.language,
    severity: args.severity,
  });
}

/**
 * Try the model up to twice inside the shared budget, then fall back.
 *
 * No attempt is started that could run past the deadline, and a first attempt
 * slower than half the budget ends the loop: two attempts would no longer both
 * fit, so the caller gets the labelled fallback instead of a platform timeout.
 */
async function runAttempts(args: GeneratePlanArgs, apiKey: string): Promise<PlanResult> {
  const budget = budgetFor(args);
  const user = userTurn(args);
  // 'timeout' is the honest reason if the budget is gone before any attempt can
  // start (for example after a slow air fetch).
  let lastReason: FallbackReason = 'timeout';

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const remainingMs = budget.deadline - Date.now();
    // The first attempt runs with whatever is left (the timeout below is capped
    // by it); a retry needs enough room to be worth starting.
    if (remainingMs < (attempt === 0 ? 1 : budget.minRetryMs)) break;

    const attemptStarted = Date.now();
    const result = await attemptOnce({
      args,
      apiKey,
      user,
      timeoutMs: Math.min(budget.attemptCapMs, remainingMs),
    });
    if (result.plan) return { plan: result.plan, usedLlm: true };
    lastReason = result.reason;
    if (!result.retryable) break;

    // Budget check for the retry: only a first attempt that finished inside half
    // the budget leaves room for a second one that still ends before the
    // deadline. A slower first attempt falls back immediately.
    if (Date.now() - attemptStarted >= budget.retryThresholdMs) break;
  }

  return fallbackResult(args, lastReason);
}

/**
 * Produce a plan for a snapshot, profile and severity: the model when allowed,
 * always with a deterministic fallback.
 *
 * @param args Profile, air snapshot, derived indices, language and time budget.
 * @returns The plan, whether the model produced it, and the fallback reason.
 */
export async function generatePlan(args: GeneratePlanArgs): Promise<PlanResult> {
  const ready = await preflight(args);
  if ('done' in ready) return ready.done;
  return runAttempts(args, ready.apiKey);
}
