'use client';

import type { AirPoint } from '@/lib/types';

interface ChartProps {
  history: AirPoint[];
  forecast: AirPoint[];
  label: string;
  summary: string;
}

/**
 * Inline SVG chart (no chart library, no inline styles), so it satisfies the
 * strict CSP and adds nothing to the bundle.
 */
export function TrendChart({ history, forecast, label, summary }: ChartProps) {
  const series = [...history, ...forecast].filter(
    (point): point is AirPoint & { usAqi: number } => typeof point.usAqi === 'number',
  );

  if (series.length < 2) {
    return <p className="hint">{label}</p>;
  }

  const width = 620;
  const height = 180;
  const padding = { top: 12, right: 8, bottom: 20, left: 34 };
  const maxValue = Math.max(100, ...series.map((point) => point.usAqi));
  const plotWidth = width - padding.left - padding.right;
  const plotHeight = height - padding.top - padding.bottom;
  const stepX = plotWidth / (series.length - 1);

  const x = (index: number) => padding.left + index * stepX;
  const y = (value: number) => padding.top + plotHeight - (value / maxValue) * plotHeight;

  const nowIndex = Math.max(0, history.length - 1);
  const linePath = series
    .map((point, index) => `${index === 0 ? 'M' : 'L'}${x(index).toFixed(1)},${y(point.usAqi).toFixed(1)}`)
    .join(' ');
  const areaPath = `${linePath} L${x(series.length - 1).toFixed(1)},${(padding.top + plotHeight).toFixed(1)} L${padding.left},${(
    padding.top + plotHeight
  ).toFixed(1)} Z`;

  const ticks = [0, Math.round(maxValue / 2), maxValue];
  const firstLabel = series[0]?.time.slice(11, 16) ?? '';
  const nowLabel = series[nowIndex]?.time.slice(11, 16) ?? '';
  const lastLabel = series[series.length - 1]?.time.slice(11, 16) ?? '';

  return (
    <figure className="m-0">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        width="100%"
        role="img"
        aria-label={`${label}. ${summary}`}
        className="h-auto w-full"
        preserveAspectRatio="none"
      >
        {ticks.map((tick) => (
          <g key={tick}>
            <line
              x1={padding.left}
              x2={width - padding.right}
              y1={y(tick)}
              y2={y(tick)}
              stroke="currentColor"
              strokeOpacity="0.18"
              strokeWidth="1"
            />
            <text x={4} y={y(tick) + 4} fontSize="11" fill="currentColor" opacity="0.75">
              {tick}
            </text>
          </g>
        ))}

        <path d={areaPath} fill="currentColor" opacity="0.12" />
        <path
          d={linePath}
          fill="none"
          stroke="var(--band-solid)"
          strokeWidth="2.5"
          strokeLinejoin="round"
          strokeLinecap="round"
        />

        <line
          x1={x(nowIndex)}
          x2={x(nowIndex)}
          y1={padding.top}
          y2={padding.top + plotHeight}
          stroke="currentColor"
          strokeOpacity="0.5"
          strokeDasharray="4 4"
        />
        <circle
          cx={x(nowIndex)}
          cy={y(series[nowIndex]?.usAqi ?? 0)}
          r="4.5"
          fill="var(--band-solid)"
          stroke="var(--surface)"
          strokeWidth="2"
        />

        <text x={padding.left} y={height - 4} fontSize="11" fill="currentColor" opacity="0.75">
          {firstLabel}
        </text>
        <text
          x={x(nowIndex)}
          y={height - 4}
          fontSize="11"
          fill="currentColor"
          opacity="0.9"
          textAnchor="middle"
        >
          {nowLabel}
        </text>
        <text
          x={width - padding.right}
          y={height - 4}
          fontSize="11"
          fill="currentColor"
          opacity="0.75"
          textAnchor="end"
        >
          {lastLabel}
        </text>
      </svg>

      <figcaption className="hint mt-2">
        {summary} — {label}
      </figcaption>

      {/* Text alternative for screen readers and low-bandwidth mode. */}
      <details className="mt-2">
        <summary className="cursor-pointer text-sm font-semibold">{label}</summary>
        <ul className="mt-2 grid grid-cols-2 gap-x-4 text-sm sm:grid-cols-3">
          {series.map((point) => (
            <li key={`${point.time}-${point.usAqi}`} className="tabular-nums">
              {point.time.slice(11, 16)} — {Math.round(point.usAqi)}
            </li>
          ))}
        </ul>
      </details>
    </figure>
  );
}
