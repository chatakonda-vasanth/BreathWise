'use client';

import dynamic from 'next/dynamic';
import { BAND_COLOURS } from '@/lib/air/aqi';
import type { AskQuestion } from '@/lib/ai/askQuestions';
import type { AirState } from '@/hooks/use-air-data';
import type { AppFlow } from '@/hooks/use-app-flow';
import type { PlanState } from '@/hooks/use-plan-request';
import type { AirResponse } from '@/lib/shared/apiSchemas';
import { SEVERITY_LABELS, t } from '@/lib/i18n';
import type { SelectedLocation } from '@/lib/shared/location';
import type { PlanAnswerBody, Profile } from '@/lib/shared/schemas';
import type { Language, Plan } from '@/lib/shared/types';
import { AirPanel } from '../air-panel';
import { CitySearch } from '../city-search';
import { ProfileForm } from '../profile-form';
import { Banner, LoadingCard, SectionHeading } from '../ui';

/**
 * The plan screen is only reachable after a search and a submit, so its code is
 * fetched on demand instead of in the first load. The skeleton is decorative;
 * the live status message above it is what tells a screen reader what is
 * happening.
 */
const PlanView = dynamic(() => import('../plan-view').then((module) => module.PlanView), {
  loading: () => <div className="skeleton h-48 rounded" aria-hidden="true" />,
});

/** Step 1: pick a place. */
function LocationStep({
  lang,
  onSelect,
}: {
  lang: Language;
  onSelect: (selected: SelectedLocation) => void;
}) {
  return (
    <section aria-labelledby="location-heading">
      <SectionHeading id="location-heading">{t(lang, 'locationTitle')}</SectionHeading>
      <div className="mt-2">
        <CitySearch lang={lang} onSelect={onSelect} />
      </div>
    </section>
  );
}

interface AirSectionProps {
  lang: Language;
  location: SelectedLocation | null;
  air: AirState;
  lowBandwidth: boolean;
  onToggleLowBandwidth: () => void;
  onUseLive: () => void;
  onChangeLocation: () => void;
}

/**
 * The chosen place plus its air panel. Its own component so the busy / loaded /
 * absent states are one readable branch each instead of nested ternaries inside
 * the shell.
 */
function AirSection({
  lang,
  location,
  air,
  lowBandwidth,
  onToggleLowBandwidth,
  onUseLive,
  onChangeLocation,
}: AirSectionProps) {
  return (
    <>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 no-print">
        <p className="text-sm">
          <span className="opacity-75">{t(lang, 'choosing')}: </span>
          <strong>{location?.label}</strong>
        </p>
        <button type="button" className="btn text-sm" onClick={onChangeLocation}>
          {t(lang, 'change')}
        </button>
      </div>

      <div className="mt-3">
        {air.airLoading ? (
          <LoadingCard label={t(lang, 'loading')} />
        ) : air.airData ? (
          <AirPanel
            data={air.airData}
            lang={lang}
            lowBandwidth={lowBandwidth}
            onToggleLowBandwidth={onToggleLowBandwidth}
            onUseSample={air.useSample}
            onUseLive={onUseLive}
          />
        ) : null}
      </div>
    </>
  );
}

interface ProfileStepProps {
  lang: Language;
  profile: Profile;
  plan: PlanState;
  onProfileChange: (patch: Partial<Profile>) => void;
  onSubmit: () => void;
  onCancel: () => void;
  onBack: () => void;
}

/** Step 2: the profile, plus the generation status and error banner. */
function ProfileStep({
  lang,
  profile,
  plan,
  onProfileChange,
  onSubmit,
  onCancel,
  onBack,
}: ProfileStepProps) {
  const status = plan.planSlow ? t(lang, 'generatingSlow') : t(lang, 'generating');
  return (
    <div className="mt-4">
      <ProfileForm
        lang={lang}
        value={profile}
        busy={plan.planLoading}
        onChange={onProfileChange}
        onSubmit={onSubmit}
        onSkip={onSubmit}
        onBack={onBack}
      />
      {plan.planLoading ? (
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <p className="hint" role="status" aria-live="polite">
            {status}
          </p>
          {plan.planSlow ? (
            <button type="button" className="btn text-sm" onClick={onCancel}>
              {t(lang, 'cancelPlan')}
            </button>
          ) : null}
        </div>
      ) : null}
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
function PlanProvenance({
  lang,
  airData,
}: {
  lang: Language;
  airData: AirResponse | null;
}) {
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

interface PlanStepProps {
  lang: Language;
  plan: Plan;
  airData: AirResponse | null;
  profile: Profile;
  location: SelectedLocation | null;
  onBack: () => void;
  onRegenerate: () => void;
  onAsk: (question: AskQuestion) => void;
  answer: PlanAnswerBody | null;
  answerLoading: AskQuestion | null;
  answerError: string | null;
}

/** Step 3: provenance banners, the AQI summary line and the plan itself. */
function PlanStep({
  lang,
  plan,
  airData,
  profile,
  location,
  onBack,
  onRegenerate,
  onAsk,
  answer,
  answerLoading,
  answerError,
}: PlanStepProps) {
  return (
    <div className="mt-4">
      <PlanProvenance lang={lang} airData={airData} />
      <PlanView
        plan={plan}
        lang={lang}
        onBack={onBack}
        onRegenerate={onRegenerate}
        profile={profile}
        pm25={airData?.air.current.pm25 ?? null}
        lat={location?.lat ?? null}
        lon={location?.lon ?? null}
        onAsk={onAsk}
        answer={answer}
        answerLoading={answerLoading}
        answerError={answerError}
      />
    </div>
  );
}

/** The step screens, in order, with the shared air-error banner above them. */
export function MainSteps({ flow }: { flow: AppFlow }) {
  const { lang, step, location, profile, lowBandwidth, air, plan } = flow;

  return (
    <>
      {step === 1 ? <LocationStep lang={lang} onSelect={flow.selectLocation} /> : null}

      {air.airError ? (
        <div className="mt-3">
          <Banner live="polite" tone="warn" title={t(lang, 'unavailable')}>
            <p>{t(lang, 'sampleBanner')}</p>
          </Banner>
        </div>
      ) : null}

      {step >= 2 ? (
        <AirSection
          lang={lang}
          location={location}
          air={air}
          lowBandwidth={lowBandwidth}
          onToggleLowBandwidth={() => flow.setLowBandwidth(!lowBandwidth)}
          onUseLive={() => {
            if (location) void air.load(location);
          }}
          onChangeLocation={flow.startOver}
        />
      ) : null}

      {step === 2 ? (
        <ProfileStep
          lang={lang}
          profile={profile}
          plan={plan}
          onProfileChange={flow.patchProfile}
          onSubmit={() => void flow.submitPlan()}
          onCancel={flow.cancelPlan}
          onBack={() => flow.setStep(1)}
        />
      ) : null}

      {step === 3 && plan.plan ? (
        <PlanStep
          lang={lang}
          plan={plan.plan}
          airData={air.airData}
          profile={profile}
          location={location}
          onBack={() => flow.setStep(2)}
          onRegenerate={() => void flow.submitPlan()}
          onAsk={(question) => void flow.askQuestion(question)}
          answer={plan.answer}
          answerLoading={plan.answerLoading}
          answerError={plan.answerError}
        />
      ) : null}
    </>
  );
}
