'use client';

import type { AppFlow } from '@/hooks/use-app-flow';
import { t } from '@/lib/i18n';
import type { SelectedLocation } from '@/lib/shared/location';
import type { Language } from '@/lib/shared/types';
import { AirPanel } from '../air-panel';
import { CitySearch } from '../city-search';
import { Banner, LoadingCard, SectionHeading } from '../ui';
import { PlanStep, ProfileStep } from './app-steps-screens';

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

/** The chosen place plus its air panel. */
function AirSection({ flow }: { flow: AppFlow }) {
  const { lang, location, air, lowBandwidth } = flow;
  return (
    <>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 no-print">
        <p className="text-sm">
          <span className="opacity-75">{t(lang, 'choosing')}: </span>
          <strong>{location?.label}</strong>
        </p>
        <button type="button" className="btn text-sm" onClick={flow.startOver}>
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
            onToggleLowBandwidth={() => flow.setLowBandwidth(!lowBandwidth)}
            onUseSample={air.useSample}
            onUseLive={() => {
              if (location) void air.load(location);
            }}
          />
        ) : null}
      </div>
    </>
  );
}

/** The shared air-error banner, above whichever step is open. */
function AirErrorBanner({ lang }: { lang: Language }) {
  return (
    <div className="mt-3">
      <Banner live="polite" tone="warn" title={t(lang, 'unavailable')}>
        <p>{t(lang, 'sampleBanner')}</p>
      </Banner>
    </div>
  );
}

/** The step screens, in order, with the shared air-error banner above them. */
export function MainSteps({ flow }: { flow: AppFlow }) {
  const { lang, step, air, plan } = flow;
  return (
    <>
      {step === 1 ? <LocationStep lang={lang} onSelect={flow.selectLocation} /> : null}
      {air.airError ? <AirErrorBanner lang={lang} /> : null}
      {step >= 2 ? <AirSection flow={flow} /> : null}
      {step === 2 ? <ProfileStep flow={flow} /> : null}
      {step === 3 && plan.plan ? <PlanStep flow={flow} /> : null}
    </>
  );
}
