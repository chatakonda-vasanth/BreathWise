import type { DerivedIndices } from '@/lib/air/air';
import type { AskQuestion } from './askQuestions';
import type { FallbackReason } from './fallbackPlan';
import type { Profile } from '@/lib/shared/schemas';
import type { AirSnapshot, Language, SeverityBand } from '@/lib/shared/types';

export interface PlanAnswer {
  question: AskQuestion;
  language: Language;
  text: string;
  generatedBy: 'llm' | 'fallback';
  fallbackReason?: string;
}

export interface AnswerArgs {
  question: AskQuestion;
  profile: Profile;
  snapshot: AirSnapshot;
  derived: DerivedIndices;
  severity: SeverityBand;
  language: Language;
  budgetMs?: number;
  /** Answer with the labelled rule-based text without any model call. */
  fallbackOnly?: FallbackReason;
}

export interface AnswerResult {
  answer: PlanAnswer;
  usedLlm: boolean;
  reason?: FallbackReason;
}

