'use client';

import { chartGeometry } from '@/lib/trendGeometry';
import type { AirPoint } from '@/lib/types';
import { TrendSvg } from './chart/trend-svg';
import { TrendTable } from './chart/trend-table';

interface ChartProps {
  history: AirPoint[];
  forecast: AirPoint[];
  label: string;
  summary: string;
}

/**
 * Inline SVG chart with a table alternative.
 *
 * The geometry lives in `lib/trendGeometry`, the drawing in `chart/trend-svg`
 * and the accessible table in `chart/trend-table`; this component only decides
 * what is shown together.
 */
export function TrendChart({ history, forecast, label, summary }: ChartProps) {
  const geometry = chartGeometry(history, forecast);

  if (!geometry) {
    return <p className="hint">{label}</p>;
  }

  return (
    <figure className="m-0">
      <TrendSvg geometry={geometry} label={label} summary={summary} />
      <figcaption className="hint mt-2">
        {summary} — {label}
      </figcaption>
      <TrendTable geometry={geometry} label={label} summary={summary} />
    </figure>
  );
}
