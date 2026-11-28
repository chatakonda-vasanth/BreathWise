'use client';

import { t } from '@/lib/i18n';
import type { Language, Plan } from '@/lib/shared/types';

/**
 * The plan's headline and its plain-language meaning.
 *
 * The cigarette-equivalent number always sits next to its assumption and the
 * "approximate" label, because it is a rule of thumb, not a measurement.
 */
export function PlanSummary({ plan, lang }: { plan: Plan; lang: Language }) {
  return (
    <>
      <div className="card mt-3">
        <h2 className="text-xl font-bold">{plan.headline}</h2>
        <p className="hint mt-1">
          {plan.generatedBy === 'llm'
            ? t(lang, 'planSourceLlm')
            : t(lang, 'planSourceFallback')}
        </p>
      </div>

      <div className="card mt-3">
        <h3 className="text-base font-bold">{t(lang, 'whatThisMeans')}</h3>
        <p className="mt-1 text-sm">{plan.whatThisMeans.text}</p>
        <div className="mt-3 rounded-lg border border-[var(--border)] p-3">
          <p className="text-xs font-bold uppercase tracking-wide">
            {t(lang, 'cigarette')}
          </p>
          <p className="mt-1 text-sm">{plan.whatThisMeans.cigaretteEquivalent}</p>
          <p className="hint mt-1">
            {t(lang, 'assumption')}: {plan.whatThisMeans.assumption}
          </p>
          <p className="hint mt-1">{t(lang, 'cigaretteApprox')}</p>
        </div>
      </div>
    </>
  );
}
