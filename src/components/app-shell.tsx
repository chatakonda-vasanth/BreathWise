'use client';

import dynamic from 'next/dynamic';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError, fetchAir, requestAnswer, requestPlan } from '@/lib/client';
import type { AirResponse } from '@/lib/apiSchemas';
import type { AskQuestion } from '@/lib/askQuestions';
import { BAND_COLOURS } from '@/lib/aqi';
import { roundCoord } from '@/lib/geo';
import { LANGUAGE_NAMES, SEVERITY_LABELS, loadLanguage, t, tList } from '@/lib/i18n';
import { buildFallbackPlan } from '@/lib/fallbackPlan';
import { deriveIndices } from '@/lib/indices';
import { createSampleSnapshot } from '@/lib/sampleData';
import type { PlanAnswerBody, Profile } from '@/lib/schemas';
import type { Language, Plan } from '@/lib/types';
import { AirPanel } from './air-panel';
import { CitySearch, type SelectedLocation } from './city-search';
import { ProfileForm } from './profile-form';
import { PwaRegister } from './pwa-register';
import { Banner, LoadingCard, SectionHeading } from './ui';

/**
 * The plan screen is only reachable after a search and a submit, so its code is
 * fetched on demand instead of in the first load. The skeleton is decorative;
 * the live status message above it is what tells a screen reader what is
 * happening.
 */
const PlanView = dynamic(() => import('./plan-view').then((module) => module.PlanView), {
  loading: () => <div className="skeleton h-48 rounded" aria-hidden="true" />,
});

const DEFAULT_PROFILE: Profile = {
  adults: 2,
  children: 1,
  elderly: 0,
  pregnant: false,
  sensitiveGroup: false,
  homeType: 'apartment',
  windows: 'single',
  kitchenVentilation: 'exhaustFan',
  commuteMode: 'bus',
  budget: 'low',
  language: 'en',
  symptoms: false,
};

type Step = 1 | 2 | 3;
type ThemeChoice = 'auto' | 'light' | 'dark';

/** How long before the plan spinner admits that generation is slow. */
const SLOW_PLAN_MS = 5000;

function sampleResponse(): AirResponse {
  const air = createSampleSnapshot();
  return { air, indices: deriveIndices(air) };
}

/**
 * Client entry point and the only stateful
 * component: owns step, language, theme, air data and the session plan cache.
 */
/**
 * Everything that can change the answer. Two submits with the same key would
 * ask the model for identical work, so the second one is served from memory.
 */
function planCacheKey(
  profile: Profile,
  lang: Language,
  airData: AirResponse | null,
  location: SelectedLocation,
): string {
  return JSON.stringify([
    profile,
    lang,
    airData?.indices.severity ?? null,
    airData?.air.isSample ?? false,
    location.lat,
    location.lon,
  ]);
}

/** User-facing text for a failed plan request; never the server's raw code. */
function planErrorMessage(error: unknown, lang: Language): string {
  const code = error instanceof ApiError ? error.code : '';
  return code === 'upstream_unavailable' ? t(lang, 'unavailable') : t(lang, 'planFailed');
}

const STEP_KEYS = ['stepLocation', 'stepProfile', 'stepPlan'] as const;

interface AppHeaderProps {
  lang: Language;
  theme: ThemeChoice;
  step: Step;
  onLanguage: (lang: Language) => void;
  onTheme: (theme: ThemeChoice) => void;
}

/**
 * Title, language and theme switchers, the medical notice and the progress
 * list. Kept out of `AppShell` so the stateful component stays readable.
 */
function AppHeader({ lang, theme, step, onLanguage, onTheme }: AppHeaderProps) {
  return (
    <header className="no-print">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold leading-tight sm:text-3xl">
            {t(lang, 'appName')}
          </h1>
          <p className="hint mt-1 max-w-prose">{t(lang, 'tagline')}</p>
        </div>

        <div className="flex flex-col items-end gap-2">
          <div className="flex gap-1" role="group" aria-label={t(lang, 'language')}>
            {(Object.keys(LANGUAGE_NAMES) as Language[]).map((code) => (
              <button
                key={code}
                type="button"
                className={`btn min-w-11 px-3 py-1 text-sm ${code === lang ? 'btn-primary' : ''}`}
                aria-pressed={code === lang}
                onClick={() => onLanguage(code)}
              >
                {LANGUAGE_NAMES[code]}
              </button>
            ))}
          </div>
          <div className="flex gap-1" role="group" aria-label={t(lang, 'theme')}>
            {(['auto', 'light', 'dark'] as ThemeChoice[]).map((choice) => (
              <button
                key={choice}
                type="button"
                className={`btn min-w-11 px-2 py-1 text-xs ${theme === choice ? 'btn-primary' : ''}`}
                aria-pressed={theme === choice}
                onClick={() => onTheme(choice)}
              >
                {choice}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-3">
        <Banner tone="info">
          <strong>{t(lang, 'medicalNotice')}</strong>
        </Banner>
      </div>

      <ol className="mt-4 flex flex-wrap gap-2 text-sm" aria-label={t(lang, 'progress')}>
        {STEP_KEYS.map((key, index) => {
          const value = index + 1;
          const isCurrent = step === value;
          return (
            <li key={key}>
              <span
                className={`pill ${isCurrent ? 'band-solid-bg' : ''}`}
                aria-current={isCurrent ? 'step' : undefined}
              >
                <span aria-hidden="true">{value}.</span> {t(lang, key)}
              </span>
            </li>
          );
        })}
      </ol>
    </header>
  );
}

export function AppShell() {
  const [lang, setLang] = useState<Language>('en');
  const [theme, setTheme] = useState<ThemeChoice>('auto');
  const [step, setStep] = useState<Step>(1);

  const [location, setLocation] = useState<SelectedLocation | null>(null);
  const [airData, setAirData] = useState<AirResponse | null>(null);
  const [airLoading, setAirLoading] = useState(false);
  const [airError, setAirError] = useState<string | null>(null);

  const [profile, setProfile] = useState<Profile>(DEFAULT_PROFILE);
  const [lowBandwidth, setLowBandwidth] = useState(false);

  const [plan, setPlan] = useState<Plan | null>(null);
  const [planLoading, setPlanLoading] = useState(false);
  const [planSlow, setPlanSlow] = useState(false);
  const [planError, setPlanError] = useState<string | null>(null);
  const [answer, setAnswer] = useState<PlanAnswerBody | null>(null);
  const [answerLoading, setAnswerLoading] = useState<AskQuestion | null>(null);
  const [answerError, setAnswerError] = useState<string | null>(null);
  const planAbort = useRef<AbortController | null>(null);
  /**
   * Plans already generated in this session, keyed by everything that can
   * change the answer. Regenerating with the same profile in the same AQI band
   * would ask the model for byte-identical work, so it is served from memory
   * instead — no request, no rate-limit slot, no model call.
   */
  const planCache = useRef(new Map<string, Plan>());

  useEffect(() => {
    if (theme === 'auto') {
      delete document.documentElement.dataset.theme;
    } else {
      document.documentElement.dataset.theme = theme;
    }
  }, [theme]);

  useEffect(() => {
    // Keep the document language in sync for screen readers. The profile's
    // language is stamped at submit time instead of setState-in-effect.
    document.documentElement.lang = lang;
  }, [lang]);

  const loadAir = useCallback(
    async (target: SelectedLocation) => {
      setAirLoading(true);
      setAirError(null);
      setAirData(null);
      try {
        const data = await fetchAir(target.lat, target.lon);
        setAirData(data);
      } catch {
        // Live data is unavailable: fall back to clearly labelled sample mode.
        setAirError(t(lang, 'unavailable'));
        setAirData(sampleResponse());
      } finally {
        setAirLoading(false);
      }
    },
    [lang],
  );

  function handleSelectLocation(selected: SelectedLocation) {
    const normalised: SelectedLocation = {
      lat: roundCoord(selected.lat),
      lon: roundCoord(selected.lon),
      label: selected.label,
    };
    setLocation(normalised);
    setStep(2);
    setPlan(null);
    void loadAir(normalised);
  }

  /**
   * Switch language only after its pack is in memory: `t()` is synchronous, so
   * rendering first would show a frame of English (or, worse, a half-page in
   * the old language).
   */
  async function selectLanguage(code: Language) {
    if (code === lang) return;
    await loadLanguage(code);
    setLang(code);
  }

  /**
   * Ask one fixed quick question. Only the enum and the enumerated profile go
   * out; the server re-fetches the air data and applies the same guardrails.
   */
  async function handleAsk(question: AskQuestion) {
    if (!location) return;
    setAnswerLoading(question);
    setAnswerError(null);
    try {
      const response = await requestAnswer({
        profile: { ...profile, language: lang },
        lat: location.lat,
        lon: location.lon,
        sample: airData?.air.isSample ?? false,
        question,
      });
      setAnswer(response.answer);
    } catch {
      setAnswerError(t(lang, 'askFailed'));
    } finally {
      setAnswerLoading(null);
    }
  }

  async function handleSubmitPlan() {
    if (!location) return;
    const cacheKey = planCacheKey(profile, lang, airData, location);
    const cached = planCache.current.get(cacheKey);
    if (cached) {
      setPlanError(null);
      setPlanLoading(false);
      setPlan(cached);
      setStep(3);
      return;
    }
    // A regenerate must not race the previous request.
    planAbort.current?.abort();
    const controller = new AbortController();
    planAbort.current = controller;
    setPlanLoading(true);
    setPlanSlow(false);
    setPlanError(null);
    setPlan(null);
    setAnswer(null);
    setAnswerError(null);
    // A real generation can take 10-20 s; after 5 s say so instead of leaving a
    // silent spinner. The timer is cleared with the request.
    const slowTimer = setTimeout(() => setPlanSlow(true), SLOW_PLAN_MS);
    try {
      const response = await requestPlan(
        {
          profile: { ...profile, language: lang },
          lat: location.lat,
          lon: location.lon,
          sample: airData?.air.isSample ?? false,
        },
        controller.signal,
      );
      planCache.current.set(cacheKey, response.plan);
      setPlan(response.plan);
      setStep(3);
    } catch (error) {
      // Cancelled by the user: the fallback plan is already on screen, so this
      // is not an error.
      if (controller.signal.aborted) return;
      setPlanError(planErrorMessage(error, lang));
    } finally {
      clearTimeout(slowTimer);
      setPlanSlow(false);
      setPlanLoading(false);
      if (planAbort.current === controller) planAbort.current = null;
    }
  }

  /**
   * Cancel a slow generation. The deterministic plan is built in the browser
   * from the snapshot already on screen, so the user gets the guidance at once
   * instead of waiting for the model or the request to unwind.
   */
  function handleCancelPlan() {
    if (!airData) return;
    planAbort.current?.abort();
    planAbort.current = null;
    setPlan(
      buildFallbackPlan({
        snapshot: airData.air,
        profile: { ...profile, language: lang },
        language: lang,
        severity: airData.indices.severity,
        naqiBand: airData.indices.naqi.band,
        reason: 'cancelled',
      }),
    );
    setPlanSlow(false);
    setPlanLoading(false);
    setStep(3);
  }

  const severity = airData?.indices.severity ?? 'moderate';

  return (
    <div lang={lang} data-band={severity}>
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded focus:bg-[var(--surface)] focus:px-3 focus:py-2"
      >
        {t(lang, 'skipToContent')}
      </a>

      <div className="mx-auto max-w-3xl px-4 pb-16 pt-5">
        <AppHeader
          lang={lang}
          theme={theme}
          step={step}
          onLanguage={(code) => void selectLanguage(code)}
          onTheme={setTheme}
        />

        {/* tabIndex -1 lets the skip link move real focus here. */}
        <main id="main" tabIndex={-1} className="mt-4 outline-none">
          {step === 1 ? (
            <LocationStep lang={lang} onSelect={handleSelectLocation} />
          ) : null}

          {airError ? (
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
              airLoading={airLoading}
              airData={airData}
              lowBandwidth={lowBandwidth}
              onToggleLowBandwidth={() => setLowBandwidth((value) => !value)}
              onUseSample={() => setAirData(sampleResponse())}
              onUseLive={() => {
                if (location) void loadAir(location);
              }}
              onChangeLocation={() => {
                setStep(1);
                setPlan(null);
              }}
            />
          ) : null}

          {step === 2 ? (
            <ProfileStep
              lang={lang}
              profile={profile}
              planLoading={planLoading}
              planSlow={planSlow}
              planError={planError}
              onProfileChange={(patch) =>
                setProfile((current) => ({ ...current, ...patch }))
              }
              onSubmit={() => void handleSubmitPlan()}
              onBack={() => setStep(1)}
              onCancel={handleCancelPlan}
            />
          ) : null}

          {step === 3 && plan ? (
            <PlanStep
              lang={lang}
              plan={plan}
              airData={airData}
              profile={profile}
              location={location}
              onBack={() => setStep(2)}
              onRegenerate={() => void handleSubmitPlan()}
              onAsk={(question) => void handleAsk(question)}
              answer={answer}
              answerLoading={answerLoading}
              answerError={answerError}
            />
          ) : null}
        </main>

        <AppFooter lang={lang} />
      </div>

      <PwaRegister />
    </div>
  );
}

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
  airLoading: boolean;
  airData: AirResponse | null;
  lowBandwidth: boolean;
  onToggleLowBandwidth: () => void;
  onUseSample: () => void;
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
  airLoading,
  airData,
  lowBandwidth,
  onToggleLowBandwidth,
  onUseSample,
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
        {airLoading ? (
          <LoadingCard label={t(lang, 'loading')} />
        ) : airData ? (
          <AirPanel
            data={airData}
            lang={lang}
            lowBandwidth={lowBandwidth}
            onToggleLowBandwidth={onToggleLowBandwidth}
            onUseSample={onUseSample}
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
  planLoading: boolean;
  planSlow: boolean;
  planError: string | null;
  onProfileChange: (patch: Partial<Profile>) => void;
  onSubmit: () => void;
  onBack: () => void;
  onCancel: () => void;
}

/** Step 2: the profile, plus the generation status and error banner. */
function ProfileStep({
  lang,
  profile,
  planLoading,
  planSlow,
  planError,
  onProfileChange,
  onSubmit,
  onBack,
  onCancel,
}: ProfileStepProps) {
  const status = planSlow ? t(lang, 'generatingSlow') : t(lang, 'generating');
  return (
    <div className="mt-4">
      <ProfileForm
        lang={lang}
        value={profile}
        busy={planLoading}
        onChange={onProfileChange}
        onSubmit={onSubmit}
        onSkip={onSubmit}
        onBack={onBack}
      />
      {planLoading ? (
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <p className="hint" role="status" aria-live="polite">
            {status}
          </p>
          {planSlow ? (
            <button type="button" className="btn text-sm" onClick={onCancel}>
              {t(lang, 'cancelPlan')}
            </button>
          ) : null}
        </div>
      ) : null}
      {planError ? (
        <div className="mt-3">
          <Banner live="assertive" tone="warn" title={t(lang, 'planFailed')}>
            <p>{planError}</p>
          </Banner>
        </div>
      ) : null}
    </div>
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
  const usAqi = airData?.indices.usAqi;
  const severity = airData?.indices.severity ?? 'moderate';
  return (
    <div className="mt-4">
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

/** Data attribution and the privacy explainer. */
function AppFooter({ lang }: { lang: Language }) {
  return (
    <footer className="mt-10 border-t border-[var(--border)] pt-4 text-sm no-print">
      <p>{t(lang, 'footerData')}</p>
      <p className="hint mt-1">{t(lang, 'footerMedical')}</p>

      <details className="mt-3">
        <summary className="cursor-pointer font-semibold">
          {t(lang, 'privacyTitle')}
        </summary>
        <ul className="mt-2 list-disc space-y-1 pl-5">
          {tList(lang, 'privacyBody').map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      </details>
    </footer>
  );
}
