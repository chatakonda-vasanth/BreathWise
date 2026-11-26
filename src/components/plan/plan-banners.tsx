'use client';

import { fallbackReasonLabel, t } from '@/lib/i18n';
import type { Language, Plan } from '@/lib/types';
import { Banner } from '../ui';

/** Why the rule-based plan is on screen, in the reader's language. */
function fallbackMessage(plan: Plan, lang: Language): string {
  return plan.fallbackReason
    ? `${t(lang, 'fallbackReason')}: ${fallbackReasonLabel(lang, plan.fallbackReason)}`
    : t(lang, 'fallbackShown');
}

/**
 * The two provenance banners a plan can carry: a medical alert when the
 * household reported symptoms, and a labelled notice when the model was not
 * used. Both are text only — never HTML.
 */
export function PlanBanners({ plan, lang }: { plan: Plan; lang: Language }) {
  return (
    <>
      {plan.medicalAlert ? (
        <div className="mt-3">
          <Banner tone="danger" title={t(lang, 'medicalAlertTitle')}>
            <p>{plan.medicalAlert}</p>
            <p className="mt-1 font-semibold">{t(lang, 'medicalNotice')}</p>
          </Banner>
        </div>
      ) : null}

      {plan.generatedBy === 'fallback' ? (
        <div className="mt-3">
          <Banner tone="warn" title={t(lang, 'fallbackShown')}>
            <p>{fallbackMessage(plan, lang)}</p>
          </Banner>
        </div>
      ) : null}
    </>
  );
}
