import { describe, expect, it } from 'vitest';
import {
  CHART_HEIGHT,
  CHART_PADDING,
  CHART_WIDTH,
  chartGeometry,
} from '@/lib/trendGeometry';
import type { AirPoint } from '@/lib/types';

/** An hourly point with the given AQI, or with no AQI at all. */
function point(hour: number, usAqi: number | null): AirPoint {
  return {
    time: `2026-01-15T${String(hour).padStart(2, '0')}:00`,
    usAqi,
    pm25: usAqi === null ? null : 100,
    pm10: null,
    no2: null,
    o3: null,
  };
}

describe('trend chart geometry', () => {
  it('refuses to draw fewer than two usable points', () => {
    expect(chartGeometry([], [])).toBeNull();
    expect(chartGeometry([point(10, 80)], [])).toBeNull();
    // A gap in the data is not a point.
    expect(chartGeometry([point(10, 80), point(11, null)], [])).toBeNull();
  });

  it('uses the fixed viewBox and padding of the inline chart', () => {
    const geometry = chartGeometry([point(0, 200)], [point(1, 220)]);
    expect(geometry?.width).toBe(CHART_WIDTH);
    expect(geometry?.height).toBe(CHART_HEIGHT);
    expect(geometry?.padding).toEqual(CHART_PADDING);
  });

  it('spans the plot area from edge to edge', () => {
    const geometry = chartGeometry([point(0, 100), point(1, 150)], [point(2, 200)]);
    expect(geometry).not.toBeNull();
    if (!geometry) return;
    expect(geometry.x(0)).toBe(CHART_PADDING.left);
    expect(geometry.x(2)).toBeCloseTo(CHART_WIDTH - CHART_PADDING.right, 5);
    const plotHeight = CHART_HEIGHT - CHART_PADDING.top - CHART_PADDING.bottom;
    expect(geometry.y(0)).toBeCloseTo(CHART_PADDING.top + plotHeight, 5);
    expect(geometry.y(geometry.maxValue)).toBeCloseTo(CHART_PADDING.top, 5);
  });

  it('floors the y axis at 100 so a clean day is not exaggerated', () => {
    const geometry = chartGeometry([point(0, 12)], [point(1, 18)]);
    expect(geometry?.maxValue).toBe(100);
  });

  it('keeps a high value as the axis maximum', () => {
    const geometry = chartGeometry([point(0, 120)], [point(1, 260)]);
    expect(geometry?.maxValue).toBe(260);
    expect(geometry?.ticks).toEqual([0, 130, 260]);
  });

  it('draws one line segment per point and closes the area path', () => {
    const geometry = chartGeometry([point(0, 120), point(1, 130)], [point(2, 140)]);
    expect(geometry).not.toBeNull();
    if (!geometry) return;
    expect(geometry.linePath.startsWith('M')).toBe(true);
    expect(geometry.linePath.match(/[ML]/g)).toHaveLength(3);
    expect(geometry.areaPath.startsWith(geometry.linePath)).toBe(true);
    expect(geometry.areaPath.endsWith('Z')).toBe(true);
  });

  it('places "now" on the last history point', () => {
    const geometry = chartGeometry(
      [point(0, 120), point(1, 130), point(2, 140)],
      [point(3, 150)],
    );
    expect(geometry?.nowIndex).toBe(2);
    expect(geometry?.nowLabel).toBe('02:00');
    expect(geometry?.firstLabel).toBe('00:00');
    expect(geometry?.lastLabel).toBe('03:00');
  });

  it('clamps "now" when there is no history or anything after it', () => {
    const forecastOnly = chartGeometry([], [point(5, 120), point(6, 130)]);
    expect(forecastOnly?.nowIndex).toBe(0);
    const historyOnly = chartGeometry([point(5, 120), point(6, 130)], []);
    expect(historyOnly?.nowIndex).toBe(1);
  });

  it('labels a point whose time is missing with an empty string', () => {
    const geometry = chartGeometry(
      [{ ...point(0, 120), time: '' }, point(1, 130)],
      [point(2, 140)],
    );
    expect(geometry?.firstLabel).toBe('');
  });
});
