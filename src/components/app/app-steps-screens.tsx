'use client';

import dynamic from 'next/dynamic';
import { BAND_COLOURS } from '@/lib/air/aqi';
import type { AppFlow } from '@/hooks/use-app-flow';
import type { AirResponse } from '@/lib/shared/apiSchemas';
import { SEVERITY_LABELS, t } from '@/lib/i18n';
import type { Language } from '@/lib/shared/types';
import { ProfileForm } from '../profile-form';
import { Banner } from '../ui';

/**
 * The plan screen is only reachable after a search and a submit, so its code is
 * fetched on demand instead of in the first load. The skeleton is decorative;
 * the live status message above it is what tells a screen reader what is
 * happening.
 */
const PlanView = dynamic(() => import('../plan-view').then((module) => module.PlanView), {
  loading: () => <div className="skeleton h-48 rounded" aria-hidden="true" />,
});

/** Step 2 status line and the slow-request escape hatch. */
function ProfileStatus({ flow }: { flow: AppFlow }) {
  const { plan, lang } = flow;
  const status = plan.planSlow ? t(lang, 'generatingSlow') : t(lang, 'generating');
  return (
    <div className="mt-3 flex flex-wrap items-center gap-3">
      <p className="hint" role="status" aria-live="polite">
        {status}
      </p>
      {plan.planSlow ? (
        <button type="button" className="btn text-sm" onClick={flow.cancelPlan}>
          {t(lang, 'cancelPlan')}
        </button>
      ) : null}
    </div>
  );
}

/** Step 2: the profile, plus the generation status and error banner. */
export function ProfileStep({ flow }: { flow: AppFlow }) {
  const { lang, profile, plan } = flow;
  return (
    <div className="mt-4">
      <ProfileForm
        lang={lang}
        value={profile}
        busy={plan.planLoading}
        onChange={flow.patchProfile}
        onSubmit={() => void flow.submitPlan()}
        onSkip={() => void flow.submitPlan()}
        onBack={() => flow.setStep(1)}
      />
      {plan.planLoading ? <ProfileStatus flow={flow} /> : null}
      {plan.planError ? (
        <div className="mt-3">
          <Banner live="assertive" tone="warn" title={t(lang, 'planFailed')}>
            <p>{plan.planError}</p>
          </Banner>
        </div>
      ) : null}
    </div>
  );
}

/** Provenance above the plan: the sample banner and the AQI summary line. */
function PlanProvenance({ lang, airData }: { lang: Language; airData: AirResponse | null }) {
  const usAqi = airData?.indices.usAqi;
  const severity = airData?.indices.severity ?? 'moderate';
  return (
    <>
      {airData?.air.isSample ? (
        <div className="mb-3">
          <Banner live="polite" tone="warn" title={t(lang, 'sampleBanner')}>
            <p>{t(lang, 'sampleOn')}</p>
          </Banner>
        </div>
      ) : null}
      {typeof usAqi === 'number' ? (
        <p className="hint mb-3">
          {t(lang, 'usAqi')}: {Math.round(usAqi)} · {SEVERITY_LABELS[lang][severity]}{' '}
          <span aria-hidden="true">{BAND_COLOURS[severity].glyph}</span>
        </p>
      ) : null}
    </>
  );
}

/** Step 3: provenance banners, the AQI summary line and the plan itself. */
export function PlanStep({ flow }: { flow: AppFlow }) {
  const { lang, air, location, profile, plan } = flow;
  if (!plan.plan) return null;
  return (
    <div className="mt-4">
      <PlanProvenance lang={lang} airData={air.airData} />
      <PlanView
        plan={plan.plan}
        lang={lang}
        onBack={() => flow.setStep(2)}
        onRegenerate={() => void flow.submitPlan()}
        profile={profile}
        pm25={air.airData?.air.current.pm25 ?? null}
        lat={location?.lat ?? null}
        lon={location?.lon ?? null}
        onAsk={(question) => void flow.askQuestion(question)}
        answer={plan.answer}
        answerLoading={plan.answerLoading}
        answerError={plan.answerError}
      />
    </div>
  );
}
