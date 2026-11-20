'use client';

import type { AirResponse } from '@/lib/apiSchemas';
import { BAND_COLOURS } from '@/lib/aqi';
import { NAQI_LABELS, SEVERITY_LABELS, US_BAND_LABELS, t } from '@/lib/i18n';
import type { Language } from '@/lib/types';
import { TrendChart } from './trend-chart';
import { BandChip, Banner, SectionHeading } from './ui';

interface AirPanelProps {
  data: AirResponse;
  lang: Language;
  lowBandwidth: boolean;
  onToggleLowBandwidth: () => void;
  onUseSample: () => void;
  onUseLive: () => void;
}

function fmt(value: number | null, digits = 0): string {
  return value === null || Number.isNaN(value) ? '—' : value.toFixed(digits);
}

export function AirPanel({
  data,
  lang,
  lowBandwidth,
  onToggleLowBandwidth,
  onUseSample,
  onUseLive,
}: AirPanelProps) {
  const { air, indices } = data;
  const severity = indices.severity;
  const colour = BAND_COLOURS[severity];
  const severityLabel = SEVERITY_LABELS[lang][severity];
  const usLabel = US_BAND_LABELS[lang][indices.usBand];
  const naqiLabel = NAQI_LABELS[lang][indices.naqi.band];

  const pollutants: { key: string; label: string; value: number | null }[] = [
    { key: 'pm25', label: t(lang, 'pm25'), value: air.current.pm25 },
    { key: 'pm10', label: t(lang, 'pm10'), value: air.current.pm10 },
    { key: 'no2', label: t(lang, 'no2'), value: air.current.no2 },
    { key: 'o3', label: t(lang, 'o3'), value: air.current.o3 },
  ];

  const change = indices.changeSinceYesterday;

  return (
    <section aria-labelledby="air-heading" data-band={severity}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <SectionHeading id="air-heading">{t(lang, 'airTitle')}</SectionHeading>
        <div className="flex flex-wrap gap-2 no-print">
          <button
            type="button"
            className="btn text-sm"
            onClick={onToggleLowBandwidth}
            aria-pressed={lowBandwidth}
          >
            {lowBandwidth ? t(lang, 'lowBandwidthOff') : t(lang, 'lowBandwidthOn')}
          </button>
          {air.isSample ? (
            <button type="button" className="btn text-sm" onClick={onUseLive}>
              {t(lang, 'sampleOff')}
            </button>
          ) : (
            <button type="button" className="btn text-sm" onClick={onUseSample}>
              {t(lang, 'sampleOn')}
            </button>
          )}
        </div>
      </div>

      {air.isSample ? (
        <Banner tone="warn" title={t(lang, 'sampleBanner')}>
          <p>{t(lang, 'sampleOn')}</p>
        </Banner>
      ) : null}

      <div className="card mt-3">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-sm font-semibold uppercase tracking-wide opacity-80">
              {t(lang, 'usAqi')}
            </p>
            <p className="band-colour text-6xl font-black leading-none tabular-nums sm:text-7xl">
              {Math.round(indices.usAqi)}
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <BandChip band={severity} label={`${severityLabel} (${usLabel})`} glyph={colour.glyph} />
            </div>
            {typeof change === 'number' ? (
              <p className="hint mt-2">
                {t(lang, 'changeSinceYesterday')}:{' '}
                <strong className="tabular-nums">
                  {change > 0 ? '+' : ''}
                  {change} US AQI
                </strong>
              </p>
            ) : null}
          </div>

          <div className="min-w-[180px]">
            <p className="text-sm font-semibold uppercase tracking-wide opacity-80">
              {t(lang, 'naqi')}
            </p>
            <p className="band-colour text-4xl font-black leading-none tabular-nums">
              {Math.round(indices.naqi.value)}
            </p>
            <p className="mt-1 text-sm font-semibold">{naqiLabel}</p>
            <p className="hint mt-1">
              {t(lang, 'pm25')} · {indices.naqi.dominantPollutant.toUpperCase()}
            </p>
          </div>
        </div>

        <p className="hint mt-3">{t(lang, 'cpcbNote')}</p>

        <dl className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-sm">
          <div className="flex gap-2">
            <dt className="opacity-75">{t(lang, 'source')}:</dt>
            <dd className="font-semibold">{air.source}</dd>
          </div>
          <div className="flex gap-2">
            <dt className="opacity-75">{t(lang, 'updated')}:</dt>
            <dd className="font-semibold tabular-nums">
              <time dateTime={air.fetchedAt}>{air.current.time}</time> ({air.timezone})
            </dd>
          </div>
        </dl>

        {air.isSample ? (
          <p className="mt-2 text-xs font-semibold uppercase tracking-wide">
            Sample data
          </p>
        ) : null}
      </div>

      <ul className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {pollutants.map((pollutant) => (
          <li key={pollutant.key} className="card-tight">
            <p className="text-sm font-semibold">{pollutant.label}</p>
            <p className="text-2xl font-bold tabular-nums">{fmt(pollutant.value, 1)}</p>
            <p className="hint">µg/m³</p>
          </li>
        ))}
      </ul>

      {!lowBandwidth ? (
        <div className="card mt-3">
          <TrendChartLazy data={data} lang={lang} />
        </div>
      ) : (
        <p className="hint mt-3">{t(lang, 'chartHidden')}</p>
      )}
    </section>
  );
}

function TrendChartLazy({ data, lang }: { data: AirResponse; lang: Language }) {
  const { air } = data;
  return (
    <>
      <h3 className="text-base font-bold">{t(lang, 'history')} / {t(lang, 'forecast')}</h3>
      <TrendChart
        history={air.history}
        forecast={air.forecast}
        label={`${t(lang, 'history')} + ${t(lang, 'forecast')}`}
        summary={`${t(lang, 'usAqi')} ${Math.round(data.indices.usAqi)}`}
      />
    </>
  );
}
