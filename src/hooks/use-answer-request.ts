'use client';

import { useState } from 'react';
import type { AskQuestion } from '@/lib/ai/askQuestions';
import { requestAnswer } from '@/lib/shared/client';
import { t } from '@/lib/i18n';
import type { PlanAnswerBody } from '@/lib/shared/schemas';
import type { PlanRequestInput } from './plan-request-input';

export interface AnswerState {
  answer: PlanAnswerBody | null;
  answerLoading: AskQuestion | null;
  answerError: string | null;
  /** Ask one fixed question; resolves when the answer or the error is shown. */
  ask: (input: PlanRequestInput, question: AskQuestion) => Promise<void>;
  reset: () => void;
}

/**
 * The "ask about today's plan" request.
 *
 * Only the enum and the enumerated profile go out; the server re-fetches the
 * air data and applies the same guardrails as the plan itself.
 */
export function useAnswerRequest(): AnswerState {
  const [answer, setAnswer] = useState<PlanAnswerBody | null>(null);
  const [answerLoading, setAnswerLoading] = useState<AskQuestion | null>(null);
  const [answerError, setAnswerError] = useState<string | null>(null);

  async function ask(input: PlanRequestInput, question: AskQuestion): Promise<void> {
    setAnswerLoading(question);
    setAnswerError(null);
    try {
      const response = await requestAnswer({
        profile: { ...input.profile, language: input.lang },
        lat: input.location.lat,
        lon: input.location.lon,
        sample: input.airData?.air.isSample ?? false,
        question,
      });
      setAnswer(response.answer);
    } catch {
      setAnswerError(t(input.lang, 'askFailed'));
    } finally {
      setAnswerLoading(null);
    }
  }

  return {
    answer,
    answerLoading,
    answerError,
    ask,
    reset: () => {
      setAnswer(null);
      setAnswerError(null);
    },
  };
}
