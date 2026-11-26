'use client';

import type { ChartGeometry } from '@/lib/trendGeometry';

/** Horizontal grid lines and their axis values. */
function Grid({ geometry }: { geometry: ChartGeometry }) {
  const { padding, width, y, ticks } = geometry;
  return (
    <>
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
    </>
  );
}

/** The area fill and the line itself. */
function Series({ geometry }: { geometry: ChartGeometry }) {
  return (
    <>
      <path d={geometry.areaPath} fill="var(--band-ink)" opacity="0.12" />
      <path
        d={geometry.linePath}
        fill="none"
        stroke="var(--band-ink)"
        strokeWidth="2.5"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </>
  );
}

/** The dashed "now" line and its marker dot. */
function NowMarker({ geometry }: { geometry: ChartGeometry }) {
  const { x, y, padding, nowIndex } = geometry;
  const plotHeight = geometry.height - padding.top - padding.bottom;
  return (
    <>
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
        cy={y(geometry.points[nowIndex]?.usAqi ?? 0)}
        r="4.5"
        fill="var(--band-ink)"
        stroke="var(--surface)"
        strokeWidth="2"
      />
    </>
  );
}

/** First, current and last hour labels under the chart. */
function AxisLabels({ geometry }: { geometry: ChartGeometry }) {
  const { padding, width, x, nowIndex, firstLabel, nowLabel, lastLabel } = geometry;
  const y = geometry.height - 4;
  return (
    <>
      <text x={padding.left} y={y} fontSize="11" fill="currentColor" opacity="0.75">
        {firstLabel}
      </text>
      <text
        x={x(nowIndex)}
        y={y}
        fontSize="11"
        fill="currentColor"
        opacity="0.9"
        textAnchor="middle"
      >
        {nowLabel}
      </text>
      <text
        x={width - padding.right}
        y={y}
        fontSize="11"
        fill="currentColor"
        opacity="0.75"
        textAnchor="end"
      >
        {lastLabel}
      </text>
    </>
  );
}

/**
 * The chart itself. Inline SVG with no library and no inline styles, so it
 * satisfies the strict CSP and adds nothing to the bundle.
 */
export function TrendSvg({
  geometry,
  label,
  summary,
}: {
  geometry: ChartGeometry;
  label: string;
  summary: string;
}) {
  return (
    <svg
      viewBox={`0 0 ${geometry.width} ${geometry.height}`}
      width="100%"
      role="img"
      aria-label={`${label}. ${summary}`}
      className="h-auto w-full"
      preserveAspectRatio="xMidYMid meet"
    >
      <Grid geometry={geometry} />
      <Series geometry={geometry} />
      <NowMarker geometry={geometry} />
      <AxisLabels geometry={geometry} />
    </svg>
  );
}
