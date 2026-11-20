import type { NaqiBand, SeverityBand } from './types';

/**
 * Indian CPCB National Air Quality Index (NAQI).
 *
 * ASSUMPTION (shown in the UI): CPCB sub-indices are defined on 24-hour
 * averages. This app receives hourly model values, so the index shown is an
 * approximation computed from the current hourly concentrations using the
 * official 24-hour breakpoints.
 */

type Breakpoint = readonly [number, number, number, number];

const SUB_INDEX_BANDS: readonly Breakpoint[] = [
  [0, 50, 0, 50],
  [51, 100, 51, 100],
  [101, 200, 101, 200],
  [201, 300, 201, 300],
  [301, 400, 301, 400],
  [401, 500, 401, 500],
];

/** [cLow, cHigh, iLow, iHigh] per CPCB 24-hour breakpoint tables. */
const PM25_BREAKPOINTS: readonly Breakpoint[] = [
  [0, 30, 0, 50],
  [31, 60, 51, 100],
  [61, 90, 101, 200],
  [91, 120, 201, 300],
  [121, 250, 301, 400],
  [251, 1000, 401, 500],
];

const PM10_BREAKPOINTS: readonly Breakpoint[] = [
  [0, 50, 0, 50],
  [51, 100, 51, 100],
  [101, 250, 101, 200],
  [251, 350, 201, 300],
  [351, 430, 301, 400],
  [431, 1500, 401, 500],
];

const NO2_BREAKPOINTS: readonly Breakpoint[] = [
  [0, 40, 0, 50],
  [41, 80, 51, 100],
  [81, 180, 101, 200],
  [181, 280, 201, 300],
  [281, 400, 301, 400],
  [401, 2000, 401, 500],
];

const O3_BREAKPOINTS: readonly Breakpoint[] = [
  [0, 50, 0, 50],
  [51, 100, 51, 100],
  [101, 168, 101, 200],
  [169, 208, 201, 300],
  [209, 748, 301, 400],
  [749, 2000, 401, 500],
];

export type NaqiPollutant = 'pm25' | 'pm10' | 'no2' | 'o3';

function subIndex(concentration: number, table: readonly Breakpoint[]): number {
  if (!Number.isFinite(concentration) || concentration < 0) return 0;
  for (const [cLow, cHigh, iLow, iHigh] of table) {
    if (concentration <= cHigh) {
      const value = ((iHigh - iLow) / (cHigh - cLow)) * (concentration - cLow) + iLow;
      return Math.min(Math.max(Math.round(value), iLow), iHigh);
    }
  }
  return 500;
}

export function pm25SubIndex(pm25: number): number {
  return subIndex(pm25, PM25_BREAKPOINTS);
}

export function pm10SubIndex(pm10: number): number {
  return subIndex(pm10, PM10_BREAKPOINTS);
}

export function no2SubIndex(no2: number): number {
  return subIndex(no2, NO2_BREAKPOINTS);
}

export function o3SubIndex(o3: number): number {
  return subIndex(o3, O3_BREAKPOINTS);
}

export function naqiBand(index: number): NaqiBand {
  if (index <= 50) return 'good';
  if (index <= 100) return 'satisfactory';
  if (index <= 200) return 'moderate';
  if (index <= 300) return 'poor';
  if (index <= 400) return 'veryPoor';
  return 'severe';
}

export interface NaqiResult {
  value: number;
  band: NaqiBand;
  /** CPCB reports the pollutant with the worst sub-index as the "prominent" one. */
  dominantPollutant: NaqiPollutant;
  subIndices: Record<NaqiPollutant, number>;
}

export function naqiFromConcentrations(values: {
  pm25?: number | null;
  pm10?: number | null;
  no2?: number | null;
  o3?: number | null;
}): NaqiResult {
  const subIndices: Record<NaqiPollutant, number> = {
    pm25: typeof values.pm25 === 'number' ? pm25SubIndex(values.pm25) : 0,
    pm10: typeof values.pm10 === 'number' ? pm10SubIndex(values.pm10) : 0,
    no2: typeof values.no2 === 'number' ? no2SubIndex(values.no2) : 0,
    o3: typeof values.o3 === 'number' ? o3SubIndex(values.o3) : 0,
  };

  let dominant: NaqiPollutant = 'pm25';
  let value = -1;
  for (const key of Object.keys(subIndices) as NaqiPollutant[]) {
    const candidate = subIndices[key];
    if (candidate > value) {
      value = candidate;
      dominant = key;
    }
  }
  if (value < 0) value = 0;

  return { value, band: naqiBand(value), dominantPollutant: dominant, subIndices };
}

export function naqiBandToSeverity(band: NaqiBand): SeverityBand {
  switch (band) {
    case 'good':
      return 'good';
    case 'satisfactory':
      return 'moderate';
    case 'moderate':
      return 'sensitive';
    case 'poor':
      return 'unhealthy';
    case 'veryPoor':
      return 'veryUnhealthy';
    case 'severe':
      return 'hazardous';
  }
}

/** Exposed for tests: the raw CPCB sub-index band table. */
export const NAQI_SUB_INDEX_BANDS = SUB_INDEX_BANDS;
