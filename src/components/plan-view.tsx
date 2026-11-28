'use client';

import type { AskQuestion } from '@/lib/ai/askQuestions';
import { t } from '@/lib/i18n';
import { planToText, whatsappShareHref } from '@/lib/ai/planText';
import type { PlanAnswerBody, Profile } from '@/lib/shared/schemas';
import type { Language, Plan } from '@/lib/shared/types';
import { useCopy } from '@/hooks/use-copy';
import { useSpeech } from '@/hooks/use-speech';
import { CommunityChecklist } from './plan/community-checklist';
import { PlanContext } from './plan/plan-context';
import { PlanActions } from './plan/plan-actions';
import { PlanAsk } from './plan/plan-ask';
import { PlanBanners } from './plan/plan-banners';
import { PlanHeader } from './plan/plan-header';
import { PlanRoutines } from './plan/plan-routines';
import { PlanSummary } from './plan/plan-summary';
import { PlanRecommendations } from './plan/recommendation-card';

export { planToText } from '@/lib/ai/planText';

interface PlanViewProps {
  plan: Plan;
  lang: Language;
  onBack: () => void;
  onRegenerate: () => void;
  /** Ask one of the fixed quick questions (never free text). */
  onAsk?: (question: AskQuestion) => void;
  answer?: PlanAnswerBody | null;
  answerLoading?: AskQuestion | null;
  answerError?: string | null;
  /** Household inputs, so the plan can explain what shaped it. */
  profile?: Partial<Profile> | null;
  /** Outdoor PM2.5 for the with/without estimate; null when unavailable. */
  pm25?: number | null;
  /** Rounded coordinates, used only for the local seasonal context. */
  lat?: number | null;
  lon?: number | null;
}

/**
 * Plan screen: headline, what this means, indoor hacks, sustainable
 * alternatives, print and share actions.
 *
 * Each block is its own component; this file only decides the order and owns
 * the two pieces of view state that outlive a single block (speech and copy).
 */
export function PlanView({
  plan,
  lang,
  onBack,
  onRegenerate,
  profile,
  pm25,
  lat,
  lon,
  onAsk,
  answer,
  answerLoading,
  answerError,
}: PlanViewProps) {
  const text = planToText(plan, lang);
  const { speaking, speechError, toggle } = useSpeech(text, lang);
  const { copied, copy } = useCopy(text);

  return (
    <section aria-labelledby="plan-heading" data-band={plan.severity}>
      <PlanHeader lang={lang} severity={plan.severity} />

      <PlanBanners plan={plan} lang={lang} />
      <PlanSummary plan={plan} lang={lang} />

      <PlanContext lang={lang} profile={profile} pm25={pm25} lat={lat} lon={lon} />

      <PlanRoutines plan={plan} lang={lang} />

      {onAsk ? (
        <PlanAsk
          lang={lang}
          onAsk={onAsk}
          answer={answer}
          answerLoading={answerLoading}
          answerError={answerError}
        />
      ) : null}

      <PlanRecommendations plan={plan} lang={lang} />

      <CommunityChecklist lang={lang} />

      <PlanActions
        lang={lang}
        whatsappHref={whatsappShareHref(text)}
        speaking={speaking}
        speechError={speechError}
        copied={copied}
        onToggleReading={toggle}
        onCopy={() => void copy()}
        onRegenerate={onRegenerate}
        onBack={onBack}
      />

      <p className="hint mt-3">{t(lang, 'footerMedical')}</p>
    </section>
  );
}
