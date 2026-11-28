import { MAX_PLAN_STRING } from '@/lib/shared/constants';
import { readEnv } from '@/lib/shared/env';
import { type FallbackReason } from './fallbackPlan';
import { parseJsonText, callGemini } from './gemini';
import { attemptTimeoutMs, dailyCap, llmDisabled } from './planService';
import { SYSTEM_INSTRUCTION } from './prompt';
import { consumeDailyLlmQuota } from '@/lib/security/rateLimit';
import { looksLikeMedicalAdvice, sanitizeText, scriptMatches } from '@/lib/security/sanitize';
import { llmAnswerSchema } from '@/lib/shared/schemas';
import type { Language } from '@/lib/shared/types';
import type { AnswerArgs, AnswerResult } from './askTypes';
import { ASK_RESPONSE_SCHEMA, buildAskPrompt } from './askPrompt';
import { fallbackAnswer } from './askFallback';

export { ASK_TASK, ASK_RESPONSE_SCHEMA, buildAskPrompt, type AskPromptInput } from './askPrompt';
export { answerFromPlan } from './askFallback';

/**
 * "Ask about today's plan": a closed set of quick questions answered by the
 * model.
 *
 * The same guardrails as the plan path apply, because they are the same code:
 * - The question is an enum. No caller-supplied text exists, so nothing a user
 *   typed can reach the prompt, and an injected string fails schema validation
 *   before any model call.
 * - The user turn reuses the plan prompt's sanitised, delimited data blocks and
 *   the same system instruction (untrusted-data rule, no medical advice, no
 *   invented numbers, JSON only).
 * - Output is re-validated (strict schema, medical filter, script check,
 *   sanitisation) and any failure returns the deterministic, labelled answer.
 */

export type { AnswerArgs, AnswerResult, PlanAnswer } from './askTypes';

interface ValidatedAnswer {
  text?: string;
  reason?: FallbackReason;
}

/** Strict validation of the model's answer, identical in spirit to the plan path. */
function validateAnswer(raw: string, language: Language): ValidatedAnswer {
  let parsed: unknown;
  try {
    parsed = parseJsonText(raw);
  } catch {
    return { reason: 'invalid_output' };
  }

  const result = llmAnswerSchema.safeParse(parsed);
  if (!result.success) return { reason: 'invalid_output' };

  // Medical safety: the same filter the plan path applies.
  if (looksLikeMedicalAdvice(result.data.answer)) return { reason: 'medical_content' };

  // Language contract: Hindi/Telugu answers must really be in that script.
  if (!scriptMatches(language, result.data.answer)) return { reason: 'lang_mismatch' };

  const text = sanitizeText(result.data.answer, MAX_PLAN_STRING);
  return text.length > 0 ? { text } : { reason: 'invalid_output' };
}

/** A finished answer with the labelled fallback, with no model call. */
function fallbackResult(args: AnswerArgs, reason: FallbackReason): AnswerResult {
  return { answer: fallbackAnswer(args, reason), usedLlm: false, reason };
}

/**
 * Every reason not to call the model, decided before a request is built.
 *
 * @returns A complete answer, or null when the model may be called.
 */
async function blockedAnswer(args: AnswerArgs): Promise<AnswerResult | null> {
  if (args.fallbackOnly) return fallbackResult(args, args.fallbackOnly);
  if (llmDisabled()) return fallbackResult(args, 'llm_disabled');
  if (!readEnv('GEMINI_API_KEY')?.trim()) return fallbackResult(args, 'no_api_key');

  const quota = await consumeDailyLlmQuota(dailyCap());
  if (!quota.allowed) {
    const reason: FallbackReason =
      quota.reason === 'daily_cap' ? 'daily_cap' : 'quota_unavailable';
    return fallbackResult(args, reason);
  }

  return null;
}

/** One model attempt, with validation and the labelled fallback on any failure. */
async function modelAnswer(args: AnswerArgs, apiKey: string): Promise<AnswerResult> {
  const timeoutMs = Math.max(
    1,
    Math.min(args.budgetMs ?? attemptTimeoutMs(), attemptTimeoutMs()),
  );

  try {
    const raw = await callGemini({
      system: SYSTEM_INSTRUCTION,
      user: buildAskPrompt(args),
      apiKey,
      timeoutMs,
      schema: ASK_RESPONSE_SCHEMA,
    });
    const validated = validateAnswer(raw, args.language);
    if (!validated.text) {
      return fallbackResult(args, validated.reason ?? 'invalid_output');
    }
    return {
      answer: {
        question: args.question,
        language: args.language,
        text: validated.text,
        generatedBy: 'llm',
      },
      usedLlm: true,
    };
  } catch {
    // Transport/timeout failures: the same labelling as the plan path.
    return fallbackResult(args, 'upstream_error');
  }
}

/**
 * Answer one quick question: the model when allowed, otherwise the labelled
 * rule-based guidance. Never throws.
 *
 * @param args The fixed question, household profile, air snapshot and budget.
 * @returns The answer, whether the model produced it, and the fallback reason.
 */
export async function generateAnswer(args: AnswerArgs): Promise<AnswerResult> {
  const blocked = await blockedAnswer(args);
  if (blocked) return blocked;

  const apiKey = readEnv('GEMINI_API_KEY')?.trim() ?? '';
  return modelAnswer(args, apiKey);
}
