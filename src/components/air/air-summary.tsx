'use client';

import type { AirResponse } from '@/lib/shared/apiSchemas';
import { BAND_COLOURS } from '@/lib/air/aqi';
import { NAQI_LABELS, SEVERITY_LABELS, US_BAND_LABELS, t } from '@/lib/i18n';
import type { AirSnapshot, Language } from '@/lib/shared/types';
import { BandChip } from '../ui';

/** The headline number: US AQI, its band and yesterday's change. */
function UsAqiBlock({
  lang,
  indices,
  severity,
}: {
  lang: Language;
  indices: AirResponse['indices'];
  severity: AirResponse['indices']['severity'];
}) {
  const change = indices.changeSinceYesterday;
  return (
    <div>
      <p className="text-sm font-semibold uppercase tracking-wide opacity-80">
        {t(lang, 'usAqi')}
      </p>
      <p className="band-colour text-6xl font-bold leading-none tabular-nums sm:text-7xl">
        {Math.round(indices.usAqi)}
      </p>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <BandChip
          band={severity}
          label={`${SEVERITY_LABELS[lang][severity]} (${US_BAND_LABELS[lang][indices.usBand]})`}
          glyph={BAND_COLOURS[severity].glyph}
        />
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
  );
}

/** The India NAQI value and its dominant pollutant. */
function NaqiBlock({
  lang,
  indices,
}: {
  lang: Language;
  indices: AirResponse['indices'];
}) {
  return (
    <div className="min-w-[180px]">
      <p className="text-sm font-semibold uppercase tracking-wide opacity-80">
        {t(lang, 'naqi')}
      </p>
      <p className="band-colour text-4xl font-bold leading-none tabular-nums">
        {Math.round(indices.naqi.value)}
      </p>
      <p className="mt-1 text-sm font-semibold">{NAQI_LABELS[lang][indices.naqi.band]}</p>
      <p className="hint mt-1">
        {t(lang, 'pm25')} · {indices.naqi.dominantPollutant.toUpperCase()}
      </p>
    </div>
  );
}

/** Where the numbers came from and when they were read. */
function AirProvenance({ air, lang }: { air: AirSnapshot; lang: Language }) {
  return (
    <>
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
          {t(lang, 'sampleLabel')}
        </p>
      ) : null}
    </>
  );
}

/** Current values, both indices and provenance, in one card. */
export function AirSummary({ data, lang }: { data: AirResponse; lang: Language }) {
  return (
    <div className="card mt-3">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <UsAqiBlock lang={lang} indices={data.indices} severity={data.indices.severity} />
        <NaqiBlock lang={lang} indices={data.indices} />
      </div>

      <p className="hint mt-3">{t(lang, 'cpcbNote')}</p>
      <AirProvenance air={data.air} lang={lang} />
    </div>
  );
}
