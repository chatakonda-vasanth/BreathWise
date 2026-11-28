import { medicalAlertFor } from './fallbackPlan';
import type { FallbackReason } from './fallbackPlan';
import { parseJsonText } from './gemini';
import { llmPlanSchema } from '@/lib/shared/schemas';
import { looksLikeMedicalAdvice, sanitizePlan, scriptMatches } from '@/lib/security/sanitize';
import type { Language, NaqiBand, Plan, SeverityBand } from '@/lib/shared/types';

/**
 * Validation of the model's plan output.
 *
 * The same strict checks the orchestration relies on, kept in their own module:
 * parse, schema, medical safety, language contract, then a sanitised `Plan`.
 */

export interface PlanValidationContext {
  language: Language;
  severity: SeverityBand;
  naqiBand: NaqiBand;
  symptoms: boolean;
}

export interface ValidationOutcome {
  ok: boolean;
  reason?: FallbackReason;
  plan?: Plan;
}

type ModelPlan = ReturnType<typeof llmPlanSchema.parse>;

/** Every model-authored string, joined for the medical filter. */
function allText(data: ModelPlan): string {
  const items = [...data.indoorHacks, ...data.sustainableAlternatives];
  return [
    data.headline,
    data.whatThisMeans,
    data.cigaretteEquivalentNote,
    data.bestTimeToGoOut,
    data.maskGuidance,
    data.schoolAndCommute,
    data.exerciseTiming,
    ...items.flatMap((item) => [item.title, item.detail, item.impact.mechanism]),
  ].join('\n');
}

/** The slice of the answer the language contract is checked against. */
function languageSample(data: ModelPlan): string {
  return [
    data.headline,
    data.whatThisMeans,
    data.bestTimeToGoOut,
    ...data.indoorHacks.map((item) => item.detail),
  ].join(' ');
}

/** Assemble a `Plan` from validated model fields, recomputing the alert. */
function toPlan(data: ModelPlan, context: PlanValidationContext): Plan {
  return {
    language: context.language,
    severity: context.severity,
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
      context.language,
      context.severity,
      context.naqiBand,
      context.symptoms,
    ),
    generatedBy: 'llm',
  };
}

/**
 * Parse and validate raw model text into a usable plan.
 *
 * @param raw Model text; untrusted.
 * @param context Language, severity, NAQI band and symptom flag for the checks.
 * @returns `{ok: true, plan}` or `{ok: false, reason}` when any check fails.
 */
export function validateModelOutput(
  raw: string,
  context: PlanValidationContext,
): ValidationOutcome {
  let parsed: unknown;
  try {
    parsed = parseJsonText(raw);
  } catch {
    return { ok: false, reason: 'invalid_output' };
  }

  const result = llmPlanSchema.safeParse(parsed);
  if (!result.success) return { ok: false, reason: 'invalid_output' };

  // Medical safety: refuse dosage/diagnosis content regardless of the prompt.
  if (looksLikeMedicalAdvice(allText(result.data))) {
    return { ok: false, reason: 'medical_content' };
  }

  // Language contract: Hindi/Telugu output must actually be in that script.
  if (!scriptMatches(context.language, languageSample(result.data))) {
    return { ok: false, reason: 'lang_mismatch' };
  }

  return { ok: true, plan: sanitizePlan(toPlan(result.data, context)) };
}
