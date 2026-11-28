'use client';

import { ASK_LABEL_KEY, ASK_QUESTIONS, type AskQuestion } from '@/lib/ai/askQuestions';
import { fallbackReasonLabel, t } from '@/lib/i18n';
import type { PlanAnswerBody } from '@/lib/shared/schemas';
import type { Language } from '@/lib/shared/types';
import { Banner, SectionHeading } from '../ui';

interface PlanAskProps {
  lang: Language;
  onAsk: (question: AskQuestion) => void;
  answer?: PlanAnswerBody | null;
  answerLoading?: AskQuestion | null;
  answerError?: string | null;
}

/** Why an answer came from the rule-based path, when it did. */
function answerFallbackNote(reason: string | undefined, lang: Language): string {
  return `${t(lang, 'askFallback')}${
    reason ? ` (${t(lang, 'fallbackReason')}: ${fallbackReasonLabel(lang, reason)})` : ''
  }`;
}

/**
 * "Ask about today's plan": six fixed buttons, no text input.
 *
 * The question is an enum sent to the server, which applies the same guardrails
 * and the same labelled fallback as the plan itself.
 */
export function PlanAsk({
  lang,
  onAsk,
  answer,
  answerLoading,
  answerError,
}: PlanAskProps) {
  return (
    <section className="mt-5" aria-labelledby="ask-heading">
      <SectionHeading id="ask-heading">{t(lang, 'askTitle')}</SectionHeading>
      <p className="hint mt-1">{t(lang, 'askHelp')}</p>
      <div
        className="mt-2 flex flex-wrap gap-2"
        role="group"
        aria-label={t(lang, 'askTitle')}
        aria-busy={Boolean(answerLoading)}
      >
        {ASK_QUESTIONS.map((question) => (
          <button
            key={question}
            type="button"
            className="btn text-sm"
            aria-pressed={answer?.question === question}
            disabled={Boolean(answerLoading)}
            onClick={() => onAsk(question)}
          >
            {t(lang, ASK_LABEL_KEY[question])}
          </button>
        ))}
      </div>

      {answerLoading ? (
        <p className="hint mt-2" role="status" aria-live="polite">
          {t(lang, 'askAnswering')}
        </p>
      ) : null}

      {answer ? (
        <div className="card mt-3" role="status" aria-live="polite">
          <h3 className="text-base font-bold">
            {t(lang, ASK_LABEL_KEY[answer.question])}
          </h3>
          <p className="mt-1 text-sm">{answer.text}</p>
          {answer.generatedBy === 'fallback' ? (
            <p className="hint mt-2">{answerFallbackNote(answer.fallbackReason, lang)}</p>
          ) : null}
        </div>
      ) : null}

      {answerError ? (
        <div className="mt-3">
          <Banner live="assertive" tone="warn" title={t(lang, 'askFailed')}>
            <p>{answerError}</p>
          </Banner>
        </div>
      ) : null}
    </section>
  );
}
