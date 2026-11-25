import type { SeverityBand, UsBand } from './types';

/** Linear-interpolation breakpoint table: [cLow, cHigh, iLow, iHigh]. */
type Breakpoint = readonly [number, number, number, number];

/**
 * US EPA AQI breakpoints (2024 revision of the PM2.5 table).
 * Concentrations are µg/m³ (24-hour average for PM, 8-hour for O3/NO2).
 */
const PM25_BREAKPOINTS: readonly Breakpoint[] = [
  [0, 9.0, 0, 50],
  [9.1, 35.4, 51, 100],
  [35.5, 55.4, 101, 150],
  [55.5, 125.4, 151, 200],
  [125.5, 225.4, 201, 300],
  [225.5, 325.4, 301, 500],
];

const PM10_BREAKPOINTS: readonly Breakpoint[] = [
  [0, 54, 0, 50],
  [55, 154, 51, 100],
  [155, 254, 101, 150],
  [255, 354, 151, 200],
  [355, 424, 201, 300],
  [425, 1000, 301, 500],
];

const NO2_1H_BREAKPOINTS: readonly Breakpoint[] = [
  [0, 53, 0, 50],
  [54, 100, 51, 100],
  [101, 360, 101, 150],
  [361, 649, 151, 200],
  [650, 1249, 201, 300],
  [1250, 4000, 301, 500],
];

const O3_1H_BREAKPOINTS: readonly Breakpoint[] = [
  [0, 106, 0, 50],
  [107, 153, 51, 100],
  [154, 205, 101, 150],
  [206, 266, 151, 200],
  [267, 500, 201, 300],
  [501, 1200, 301, 500],
];

function interpolate(concentration: number, table: readonly Breakpoint[]): number {
  if (!Number.isFinite(concentration) || concentration < 0) return 0;
  for (const [cLow, cHigh, iLow, iHigh] of table) {
    if (concentration <= cHigh) {
      const index = ((iHigh - iLow) / (cHigh - cLow)) * (concentration - cLow) + iLow;
      return Math.min(Math.max(Math.round(index), iLow), iHigh);
    }
  }
  return 500;
}

/**
 * US EPA PM2.5 sub-index, truncated to an integer.
 * Health assumption: the EPA 24-hour breakpoints below are the ones public
 * health messaging uses; a sub-index is not a diagnosis and does not account
 * for individual sensitivity.
 */
export function pm25UsAqi(pm25: number): number {
  return interpolate(pm25, PM25_BREAKPOINTS);
}

/**
 * US EPA PM10 sub-index, truncated to an integer.
 * Health assumption: coarse particles count less per µg/m³ than PM2.5, which
 * is why the breakpoints differ.
 */
export function pm10UsAqi(pm10: number): number {
  return interpolate(pm10, PM10_BREAKPOINTS);
}

/**
 * US EPA NO2 sub-index, truncated to an integer.
 */
export function no2UsAqi(no2: number): number {
  return interpolate(no2, NO2_1H_BREAKPOINTS);
}

/**
 * US EPA ozone sub-index, truncated to an integer.
 */
export function o3UsAqi(o3: number): number {
  return interpolate(o3, O3_1H_BREAKPOINTS);
}

/**
 * UsBand for an AQI value; values outside 0-500 clamp
 * to the nearest band instead of failing.
 */
export function usBand(aqi: number): UsBand {
  if (aqi <= 50) return 'good';
  if (aqi <= 100) return 'moderate';
  if (aqi <= 150) return 'usg';
  if (aqi <= 200) return 'unhealthy';
  if (aqi <= 300) return 'veryUnhealthy';
  return 'hazardous';
}

/**
 * Overall US AQI from the pollutants we receive. PM2.5 dominates in winter
 * smog, but the max of the available sub-indices is the correct definition.
 */
export function overallUsAqi(values: {
  pm25?: number | null;
  pm10?: number | null;
  no2?: number | null;
  o3?: number | null;
}): number {
  const candidates: number[] = [];
  if (typeof values.pm25 === 'number') candidates.push(pm25UsAqi(values.pm25));
  if (typeof values.pm10 === 'number') candidates.push(pm10UsAqi(values.pm10));
  if (typeof values.no2 === 'number') candidates.push(no2UsAqi(values.no2));
  if (typeof values.o3 === 'number') candidates.push(o3UsAqi(values.o3));
  return candidates.length === 0 ? 0 : Math.max(...candidates);
}

/** Map a US band onto the unified severity scale. */
export function usBandToSeverity(band: UsBand): SeverityBand {
  switch (band) {
    case 'good':
      return 'good';
    case 'moderate':
      return 'moderate';
    case 'usg':
      return 'sensitive';
    case 'unhealthy':
      return 'unhealthy';
    case 'veryUnhealthy':
      return 'veryUnhealthy';
    case 'hazardous':
      return 'hazardous';
  }
}

/**
 * Rough PM2.5 → cigarette equivalence used by the explainer.
 * 22 µg/m³ ≈ 1 cigarette/day is a commonly cited approximation; it is always
 * presented with that caveat, never as a health measurement.
 */
export const PM25_PER_CIGARETTE = 22;

/**
 * Rough daily cigarette equivalence used for
 * communication only: 22 µg/m³ of PM2.5 over 24 h ≈ one cigarette.
 * Assumption: short-term exposure at this concentration, not a medical risk
 * estimate, and never shown as a diagnosis.
 */
export function cigaretteEquivalent(pm25: number): number {
  if (!Number.isFinite(pm25) || pm25 <= 0) return 0;
  return Math.round((pm25 / PM25_PER_CIGARETTE) * 10) / 10;
}

/**
 * Colour tokens per severity. Each band is always rendered together with a
 * text label and a glyph, so colour is never the only indicator (WCAG 1.4.1).
 * `solid` shades all carry white text at >= 4.5:1 contrast.
 */
export interface BandColour {
  solid: string;
  ink: string;
  tint: string;
  glyph: string;
}

export const BAND_COLOURS: Record<SeverityBand, BandColour> = {
  good: { solid: '#166534', ink: '#14532d', tint: '#dcfce7', glyph: '●' },
  moderate: { solid: '#854d0e', ink: '#713f12', tint: '#fef3c7', glyph: '◆' },
  sensitive: { solid: '#9a3412', ink: '#7c2d12', tint: '#ffedd5', glyph: '▲' },
  unhealthy: { solid: '#991b1b', ink: '#7f1d1d', tint: '#fee2e2', glyph: '■' },
  veryUnhealthy: { solid: '#6b21a8', ink: '#581c87', tint: '#f3e8ff', glyph: '✚' },
  hazardous: { solid: '#7f1d1d', ink: '#450a0a', tint: '#fecaca', glyph: '☣' },
};

/** Ordering helper for "worst band wins" logic. */
export function severityRank(band: SeverityBand): number {
  return [
    'good',
    'moderate',
    'sensitive',
    'unhealthy',
    'veryUnhealthy',
    'hazardous',
  ].indexOf(band);
}

/**
 * The worse of two bands, using the AQI ordering.
 * Butterfly-plots only: combine US and Indian indices without inventing a number.
 */
export function worseBand(a: SeverityBand, b: SeverityBand): SeverityBand {
  return severityRank(a) >= severityRank(b) ? a : b;
}
