'use client';

import type { AirResponse } from '@/lib/apiSchemas';
import type { AskQuestion } from '@/lib/askQuestions';
import type { SelectedLocation } from '@/lib/location';
import type { PlanAnswerBody, Profile } from '@/lib/schemas';
import type { Language, Plan } from '@/lib/types';
import { useAnswerRequest } from './use-answer-request';
import { usePlanGeneration } from './use-plan-generation';

/** Everything that can change the answer and the place it is for. */
export interface PlanRequestInput {
  profile: Profile;
  lang: Language;
  airData: AirResponse | null;
  location: SelectedLocation;
}

export interface PlanState {
  plan: Plan | null;
  planLoading: boolean;
  planSlow: boolean;
  planError: string | null;
  answer: PlanAnswerBody | null;
  answerLoading: AskQuestion | null;
  answerError: string | null;
  submit: (input: PlanRequestInput) => Promise<void>;
  cancel: (input: PlanRequestInput) => void;
  ask: (input: PlanRequestInput, question: AskQuestion) => Promise<void>;
  /** Forget the plan and answer, for a new location or a fresh start. */
  clear: () => void;
}

/**
 * The plan screen's two requests: generation and the fixed questions.
 *
 * @param onReady Called whenever a plan is on screen, so the caller can move to
 * the plan step.
 */
export function usePlanRequest(onReady: () => void): PlanState {
  const generation = usePlanGeneration(onReady);
  const answers = useAnswerRequest();

  return {
    plan: generation.plan,
    planLoading: generation.planLoading,
    planSlow: generation.planSlow,
    planError: generation.planError,
    answer: answers.answer,
    answerLoading: answers.answerLoading,
    answerError: answers.answerError,
    submit: generation.submit,
    cancel: generation.cancel,
    ask: answers.ask,
    clear: () => {
      generation.reset();
      answers.reset();
    },
  };
}
