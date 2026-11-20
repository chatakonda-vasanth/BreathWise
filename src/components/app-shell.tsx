'use client';

import { useCallback, useEffect, useState } from 'react';
import { fetchAir, requestPlan, type ApiError } from '@/lib/client';
import type { AirResponse } from '@/lib/apiSchemas';
import { BAND_COLOURS } from '@/lib/aqi';
import { roundCoord } from '@/lib/geo';
import { LANGUAGE_NAMES, SEVERITY_LABELS, t, tList } from '@/lib/i18n';
import { deriveIndices } from '@/lib/indices';
import { createSampleSnapshot } from '@/lib/sampleData';
import type { Profile } from '@/lib/schemas';
import type { Language, Plan } from '@/lib/types';
import { AirPanel } from './air-panel';
import { CitySearch, type SelectedLocation } from './city-search';
import { PlanView } from './plan-view';
import { ProfileForm } from './profile-form';
import { PwaRegister } from './pwa-register';
import { Banner, LoadingCard, SectionHeading } from './ui';

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

function sampleResponse(): AirResponse {
  const air = createSampleSnapshot();
  return { air, indices: deriveIndices(air) };
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
  const [planError, setPlanError] = useState<string | null>(null);

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

  async function handleSubmitPlan() {
    if (!location) return;
    setPlanLoading(true);
    setPlanError(null);
    setPlan(null);
    try {
      const response = await requestPlan({
        profile: { ...profile, language: lang },
        lat: location.lat,
        lon: location.lon,
        sample: airData?.air.isSample ?? false,
      });
      setPlan(response.plan);
      setStep(3);
    } catch (error) {
      const code = (error as ApiError)?.code;
      setPlanError(
        code === 'rate_limited'
          ? t(lang, 'planFailed')
          : code === 'upstream_unavailable'
            ? t(lang, 'unavailable')
            : t(lang, 'planFailed'),
      );
    } finally {
      setPlanLoading(false);
    }
  }

  const severity = airData?.indices.severity ?? 'moderate';
  const glyph = BAND_COLOURS[severity].glyph;

  return (
    <div lang={lang} data-band={severity}>
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded focus:bg-[var(--surface)] focus:px-3 focus:py-2"
      >
        {t(lang, 'next')}
      </a>

      <div className="mx-auto max-w-3xl px-4 pb-16 pt-5">
        <header className="no-print">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h1 className="text-2xl font-black leading-tight sm:text-3xl">
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
                    className={`btn px-3 py-1 text-sm ${code === lang ? 'btn-primary' : ''}`}
                    aria-pressed={code === lang}
                    onClick={() => setLang(code)}
                  >
                    {LANGUAGE_NAMES[code]}
                  </button>
                ))}
              </div>
              <div className="flex gap-1" role="group" aria-label="Theme">
                {(['auto', 'light', 'dark'] as ThemeChoice[]).map((choice) => (
                  <button
                    key={choice}
                    type="button"
                    className={`btn px-2 py-1 text-xs ${theme === choice ? 'btn-primary' : ''}`}
                    aria-pressed={theme === choice}
                    onClick={() => setTheme(choice)}
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

          <ol className="mt-4 flex flex-wrap gap-2 text-sm" aria-label="Progress">
            {[1, 2, 3].map((value) => {
              const label =
                value === 1
                  ? t(lang, 'stepLocation')
                  : value === 2
                    ? t(lang, 'stepProfile')
                    : t(lang, 'stepPlan');
              const isCurrent = step === value;
              return (
                <li key={value}>
                  <span
                    className={`pill ${isCurrent ? 'band-solid-bg' : ''}`}
                    aria-current={isCurrent ? 'step' : undefined}
                  >
                    <span aria-hidden="true">{value}.</span> {label}
                  </span>
                </li>
              );
            })}
          </ol>
        </header>

        <main id="main" className="mt-4">
          {step === 1 ? (
            <section aria-labelledby="location-heading">
              <SectionHeading id="location-heading">{t(lang, 'locationTitle')}</SectionHeading>
              <div className="mt-2">
                <CitySearch lang={lang} onSelect={handleSelectLocation} />
              </div>
            </section>
          ) : null}

          {airError ? (
            <div className="mt-3">
              <Banner tone="warn" title={t(lang, 'unavailable')}>
                <p>{t(lang, 'sampleBanner')}</p>
              </Banner>
            </div>
          ) : null}

          {step >= 2 ? (
            <>
              <div className="mt-3 flex flex-wrap items-center justify-between gap-2 no-print">
                <p className="text-sm">
                  <span className="opacity-75">{t(lang, 'choosing')}: </span>
                  <strong>{location?.label}</strong>
                </p>
                <button
                  type="button"
                  className="btn text-sm"
                  onClick={() => {
                    setStep(1);
                    setPlan(null);
                  }}
                >
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
                    onToggleLowBandwidth={() => setLowBandwidth((value) => !value)}
                    onUseSample={() => setAirData(sampleResponse())}
                    onUseLive={() => {
                      if (location) void loadAir(location);
                    }}
                  />
                ) : null}
              </div>
            </>
          ) : null}

          {step === 2 ? (
            <div className="mt-4">
              <ProfileForm
                lang={lang}
                value={profile}
                busy={planLoading}
                onChange={(patch) => setProfile((current) => ({ ...current, ...patch }))}
                onSubmit={() => void handleSubmitPlan()}
                onSkip={() => void handleSubmitPlan()}
                onBack={() => setStep(1)}
              />
              {planLoading ? (
                <p className="mt-3 hint" role="status">
                  {t(lang, 'generating')}
                </p>
              ) : null}
              {planError ? (
                <div className="mt-3">
                  <Banner tone="warn" title={t(lang, 'planFailed')}>
                    <p>{planError}</p>
                  </Banner>
                </div>
              ) : null}
            </div>
          ) : null}

          {step === 3 && plan ? (
            <div className="mt-4">
              {airData?.air.isSample ? (
                <div className="mb-3">
                  <Banner tone="warn" title={t(lang, 'sampleBanner')}>
                    <p>{t(lang, 'sampleOn')}</p>
                  </Banner>
                </div>
              ) : null}
              {typeof airData?.indices.usAqi === 'number' ? (
                <p className="hint mb-3">
                  {t(lang, 'usAqi')}: {Math.round(airData.indices.usAqi)} ·{' '}
                  {SEVERITY_LABELS[lang][airData.indices.severity]} <span aria-hidden="true">{glyph}</span>
                </p>
              ) : null}
              <PlanView
                plan={plan}
                lang={lang}
                onBack={() => setStep(2)}
                onRegenerate={() => void handleSubmitPlan()}
              />
            </div>
          ) : null}
        </main>

        <footer className="mt-10 border-t border-[var(--border)] pt-4 text-sm no-print">
          <p>{t(lang, 'footerData')}</p>
          <p className="hint mt-1">{t(lang, 'footerMedical')}</p>

          <details className="mt-3">
            <summary className="cursor-pointer font-semibold">{t(lang, 'privacyTitle')}</summary>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              {tList(lang, 'privacyBody').map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          </details>
        </footer>
      </div>

      <PwaRegister />
    </div>
  );
}
