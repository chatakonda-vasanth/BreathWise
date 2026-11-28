import type { AirPoint, AirSnapshot } from '@/lib/shared/types';
import { AIR_SOURCE_LABEL } from '@/lib/shared/constants';

/**
 * DEMO ONLY.
 *
 * These are hand-written illustrative numbers, not measurements. They are used
 * in exactly two situations: the user explicitly toggles demo mode, or live
 * data could not be fetched. Every surface that shows them is labelled
 * "Sample data" — the values are never presented as real air quality.
 */

const HISTORY_PM25 = [
  96, 92, 88, 84, 81, 79, 77, 80, 88, 96, 104, 112, 118, 124, 130, 136, 142, 148, 152,
  156, 150, 142, 132, 120,
];

const FORECAST_PM25 = [
  112, 108, 104, 100, 96, 94, 92, 96, 104, 112, 120, 128, 136, 142, 148, 150, 144, 136,
  128, 120, 112, 106, 100, 96,
];

function point(time: string, pm25: number): AirPoint {
  return {
    time,
    usAqi: Math.round(((50 - 0) / (35.4 - 9.1)) * (pm25 - 9.1) + 51),
    pm25,
    pm10: Math.round(pm25 * 1.9),
    no2: Math.round(pm25 * 0.42),
    o3: Math.round(pm25 * 0.35),
  };
}

function buildSeries(offsets: number[], baseHour: number): AirPoint[] {
  const start = new Date('2026-01-15T00:00:00Z');
  return offsets.map((pm25, index) => {
    const date = new Date(start);
    date.setUTCHours(baseHour + index);
    return point(date.toISOString().slice(0, 13) + ':00', pm25);
  });
}

/**
 * Clearly labelled demo snapshot
 * used when live air data is unavailable. `isSample: true` is what the UI
 * banners key off, so sample values can never be mistaken for live ones.
 */
export function createSampleSnapshot(): AirSnapshot {
  const history = buildSeries(HISTORY_PM25, -24);
  const forecast = buildSeries(FORECAST_PM25, 0);
  const current = forecast[0] as AirPoint;

  return {
    lat: 0,
    lon: 0,
    timezone: 'Asia/Kolkata',
    fetchedAt: new Date().toISOString(),
    current,
    history,
    forecast,
    source: `${AIR_SOURCE_LABEL} — sample`,
    isSample: true,
  };
}
