'use client';

import { t } from '@/lib/i18n';
import type { AirSnapshot, Language } from '@/lib/shared/types';

/** One concentration, or an em dash when the upstream value is missing. */
function fmt(value: number | null, digits = 0): string {
  return value === null || Number.isNaN(value) ? '—' : value.toFixed(digits);
}

/** The four pollutant concentrations, in µg/m³. */
export function PollutantGrid({ air, lang }: { air: AirSnapshot; lang: Language }) {
  const pollutants = [
    { key: 'pm25', label: t(lang, 'pm25'), value: air.current.pm25 },
    { key: 'pm10', label: t(lang, 'pm10'), value: air.current.pm10 },
    { key: 'no2', label: t(lang, 'no2'), value: air.current.no2 },
    { key: 'o3', label: t(lang, 'o3'), value: air.current.o3 },
  ];

  return (
    <ul className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
      {pollutants.map((pollutant) => (
        <li key={pollutant.key} className="card-tight">
          <p className="text-sm font-semibold">{pollutant.label}</p>
          <p className="text-2xl font-bold tabular-nums">{fmt(pollutant.value, 1)}</p>
          <p className="hint">µg/m³</p>
        </li>
      ))}
    </ul>
  );
}
