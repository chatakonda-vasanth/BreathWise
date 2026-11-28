import type { AskQuestion } from './askQuestions';
import { MAX_PLAN_STRING } from '@/lib/shared/constants';
import { buildFallbackPlan, type FallbackReason } from './fallbackPlan';
import { sanitizeText } from '@/lib/security/sanitize';
import type { Language, Plan, Recommendation } from '@/lib/shared/types';
import type { AnswerArgs, PlanAnswer } from './askTypes';

/** Pick an indoor measure by position, degrading to whatever the plan carries. */
function hackText(plan: Plan, index: number): string {
  const items: Recommendation[] = plan.indoorHacks;
  const item = items[index] ?? items[0];
  return item ? `${item.title} — ${item.detail}` : plan.headline;
}

/**
 * Deterministic answer for the same question, taken from the reviewed
 * rule-based plan copy. Localised, band-aware and hypothesis-free.
 */
export function answerFromPlan(
  question: AskQuestion,
  plan: Plan,
  language: Language,
): PlanAnswer {
  const text =
    question === 'safeWalkToSchool'
      ? plan.schoolAndCommute
      : question === 'openWindows'
        ? hackText(plan, 0)
        : question === 'whichRoomFirst'
          ? hackText(plan, 1)
          : question === 'exerciseOutside'
            ? plan.exerciseTiming
            : question === 'masksSchoolRun'
              ? plan.maskGuidance
              : hackText(plan, 2);

  return {
    question,
    language,
    text: sanitizeText(text, MAX_PLAN_STRING),
    generatedBy: 'fallback',
    fallbackReason: plan.fallbackReason ?? 'unknown',
  };
}

export function fallbackAnswer(args: AnswerArgs, reason: FallbackReason): PlanAnswer {
  const plan = buildFallbackPlan({
    snapshot: args.snapshot,
    profile: args.profile,
    language: args.language,
    severity: args.severity,
    naqiBand: args.derived.naqi.band,
    reason,
  });
  return {
    ...answerFromPlan(args.question, plan, args.language),
    fallbackReason: reason,
  };
}
