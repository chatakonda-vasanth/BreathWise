import type { DerivedIndices } from './air';
import { getAirSnapshot } from './air';
import { DEFAULT_DAILY_LLM_CAP } from './constants';
import { medicalAlertFor, buildFallbackPlan, type FallbackReason } from './fallbackPlan';
import { LlmError, callGemini, parseJsonText } from './gemini';
import { sanitizePlan, looksLikeMedicalAdvice, scriptMatches, sanitizeText } from './sanitize';
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
}

function dailyCap(): number {
  const parsed = Number(process.env.DAILY_LLM_CAP ?? '');
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : DEFAULT_DAILY_LLM_CAP;
}

export function llmDisabled(): boolean {
  return process.env.LLM_DISABLED?.trim().toLowerCase() === 'true';
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
  if (llmDisabled()) {
    return { plan: fallback(args, 'llm_disabled'), usedLlm: false, reason: 'llm_disabled' };
  }

  const apiKey = process.env.GEMINI_API_KEY?.trim();
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

  let lastReason: FallbackReason = 'unknown';

  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const raw = await callGemini({ system, user, apiKey });
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
        // Transport failures are retried once; an invalid key will not improve.
        if (error.code === 'no_api_key') break;
      } else {
        lastReason = 'unknown';
      }
    }
  }

  return { plan: fallback(args, lastReason), usedLlm: false, reason: lastReason };
}

/** Shared by /api/plan: refetch air server-side from rounded coordinates. */
export async function snapshotForPlan(
  lat: number,
  lon: number,
): Promise<{ snapshot: AirSnapshot }> {
  const snapshot = await getAirSnapshot(lat, lon);
  return { snapshot };
}

export { sanitizeText };
