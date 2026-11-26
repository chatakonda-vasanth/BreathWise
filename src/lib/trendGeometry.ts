import type { AirPoint } from './types';

/**
 * Geometry for the inline trend chart.
 *
 * Pure arithmetic, no React and no DOM: every coordinate, path and axis label is
 * computed here so it can be reasoned about (and tested) without rendering.
 */

export const CHART_WIDTH = 620;
export const CHART_HEIGHT = 180;
/** Axis padding, in user units of the viewBox. */
export const CHART_PADDING = { top: 12, right: 8, bottom: 20, left: 34 } as const;
/** Floor for the y axis, so a clean day does not amplify tiny wobbles. */
const MIN_MAX_VALUE = 100;

/** A point known to carry a numeric US AQI. */
export type ChartPoint = AirPoint & { usAqi: number };

export interface ChartGeometry {
  points: ChartPoint[];
  width: number;
  height: number;
  padding: typeof CHART_PADDING;
  maxValue: number;
  /** Index of the "now" boundary: the last history point. */
  nowIndex: number;
  x: (index: number) => number;
  y: (value: number) => number;
  linePath: string;
  areaPath: string;
  ticks: number[];
  firstLabel: string;
  nowLabel: string;
  lastLabel: string;
}

/** "HH:MM" from an ISO hour, or an empty label when the time is missing. */
function clock(iso: string | undefined): string {
  return iso?.slice(11, 16) ?? '';
}

/** Wider points only: a gap in the data is not drawn as zero. */
function hasAqi(point: AirPoint): point is ChartPoint {
  return typeof point.usAqi === 'number';
}

/**
 * Compute the chart geometry for a history/forecast pair.
 *
 * @param history Past points, oldest first; the last one is "now".
 * @param forecast Future points, starting at "now".
 * @returns The geometry, or null when there are fewer than two usable points.
 */
export function chartGeometry(
  history: AirPoint[],
  forecast: AirPoint[],
): ChartGeometry | null {
  const points = [...history, ...forecast].filter(hasAqi);
  if (points.length < 2) return null;

  const { padding } = { padding: CHART_PADDING };
  const plotWidth = CHART_WIDTH - padding.left - padding.right;
  const plotHeight = CHART_HEIGHT - padding.top - padding.bottom;
  const maxValue = Math.max(MIN_MAX_VALUE, ...points.map((point) => point.usAqi));
  const stepX = plotWidth / (points.length - 1);

  const x = (index: number): number => padding.left + index * stepX;
  const y = (value: number): number =>
    padding.top + plotHeight - (value / maxValue) * plotHeight;

  const linePath = points
    .map(
      (point, index) =>
        `${index === 0 ? 'M' : 'L'}${x(index).toFixed(1)},${y(point.usAqi).toFixed(1)}`,
    )
    .join(' ');
  const baseY = (padding.top + plotHeight).toFixed(1);
  const areaPath = `${linePath} L${x(points.length - 1).toFixed(1)},${baseY} L${padding.left},${baseY} Z`;

  const nowIndex = Math.min(Math.max(0, history.length - 1), points.length - 1);

  return {
    points,
    width: CHART_WIDTH,
    height: CHART_HEIGHT,
    padding,
    maxValue,
    nowIndex,
    x,
    y,
    linePath,
    areaPath,
    ticks: [0, Math.round(maxValue / 2), maxValue],
    firstLabel: clock(points[0]?.time),
    nowLabel: clock(points[nowIndex]?.time),
    lastLabel: clock(points[points.length - 1]?.time),
  };
}
