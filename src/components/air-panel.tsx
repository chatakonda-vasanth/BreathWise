'use client';

import dynamic from 'next/dynamic';
import type { AirResponse } from '@/lib/shared/apiSchemas';
import { t } from '@/lib/i18n';
import type { Language } from '@/lib/shared/types';
import { AirControls } from './air/air-controls';
import { AirSummary } from './air/air-summary';
import { PollutantGrid } from './air/pollutant-grid';
import { Banner } from './ui';

/**
 * The chart is the heaviest thing on the air screen and it is not needed to act
 * on the number above it, so it is split out of the first-load bundle. The
 * skeleton is decorative: the values are already available as text (and as the
 * chart's own table) once the chunk lands.
 */
const TrendChart = dynamic(
  () => import('./trend-chart').then((module) => module.TrendChart),
  {
    loading: () => <div className="skeleton h-32 rounded" aria-hidden="true" />,
  },
);

interface AirPanelProps {
  data: AirResponse;
  lang: Language;
  lowBandwidth: boolean;
  onToggleLowBandwidth: () => void;
  onUseSample: () => void;
  onUseLive: () => void;
}

/** The lazily loaded chart card, with its own heading. */
function ChartCard({ data, lang }: { data: AirResponse; lang: Language }) {
  return (
    <>
      <h3 className="text-base font-bold">
        {t(lang, 'history')} / {t(lang, 'forecast')}
      </h3>
      <TrendChart
        history={data.air.history}
        forecast={data.air.forecast}
        label={`${t(lang, 'history')} + ${t(lang, 'forecast')}`}
        summary={`${t(lang, 'usAqi')} ${Math.round(data.indices.usAqi)}`}
      />
    </>
  );
}

/**
 * Air-quality screen: current values, pollutant cards, both indices and the
 * lazy-loaded trend chart.
 */
export function AirPanel({
  data,
  lang,
  lowBandwidth,
  onToggleLowBandwidth,
  onUseSample,
  onUseLive,
}: AirPanelProps) {
  const severity = data.indices.severity;

  return (
    <section aria-labelledby="air-heading" data-band={severity}>
      <AirControls
        lang={lang}
        lowBandwidth={lowBandwidth}
        isSample={data.air.isSample}
        onToggleLowBandwidth={onToggleLowBandwidth}
        onUseSample={onUseSample}
        onUseLive={onUseLive}
      />

      {data.air.isSample ? (
        <Banner live="polite" tone="warn" title={t(lang, 'sampleBanner')}>
          <p>{t(lang, 'sampleOn')}</p>
        </Banner>
      ) : null}

      <AirSummary data={data} lang={lang} />
      <PollutantGrid air={data.air} lang={lang} />

      {lowBandwidth ? (
        <p className="hint mt-3">{t(lang, 'chartHidden')}</p>
      ) : (
        <div className="card mt-3">
          <ChartCard data={data} lang={lang} />
        </div>
      )}
    </section>
  );
}
