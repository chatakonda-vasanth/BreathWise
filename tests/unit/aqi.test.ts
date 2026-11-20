import { describe, expect, it } from 'vitest';
import {
  BAND_COLOURS,
  cigaretteEquivalent,
  overallUsAqi,
  pm10UsAqi,
  pm25UsAqi,
  severityRank,
  usBand,
  usBandToSeverity,
  worseBand,
} from '@/lib/aqi';

describe('US AQI computation', () => {
  it('maps PM2.5 breakpoints to the EPA index', () => {
    expect(pm25UsAqi(0)).toBe(0);
    expect(pm25UsAqi(9)).toBe(50);
    expect(pm25UsAqi(9.1)).toBe(51);
    expect(pm25UsAqi(35.4)).toBe(100);
    expect(pm25UsAqi(55.4)).toBe(150);
    expect(pm25UsAqi(125.4)).toBe(200);
    expect(pm25UsAqi(225.4)).toBe(300);
    expect(pm25UsAqi(325.4)).toBe(500);
    expect(pm25UsAqi(500)).toBe(500);
  });

  it('clamps beyond the table instead of returning NaN', () => {
    expect(pm25UsAqi(9999)).toBe(500);
    expect(pm25UsAqi(-5)).toBe(0);
  });

  it('maps PM10 breakpoints', () => {
    expect(pm10UsAqi(54)).toBe(50);
    expect(pm10UsAqi(154)).toBe(100);
    expect(pm10UsAqi(254)).toBe(150);
  });

  it('returns the worst available sub-index', () => {
    expect(overallUsAqi({ pm25: 10, pm10: 200, no2: 40, o3: 40 })).toBe(
      pm10UsAqi(200),
    );
    expect(overallUsAqi({})).toBe(0);
  });

  it('categorises index boundaries', () => {
    expect(usBand(0)).toBe('good');
    expect(usBand(50)).toBe('good');
    expect(usBand(51)).toBe('moderate');
    expect(usBand(101)).toBe('usg');
    expect(usBand(151)).toBe('unhealthy');
    expect(usBand(201)).toBe('veryUnhealthy');
    expect(usBand(301)).toBe('hazardous');
  });

  it('maps to the unified severity scale', () => {
    expect(usBandToSeverity('usg')).toBe('sensitive');
    expect(usBandToSeverity('hazardous')).toBe('hazardous');
  });

  it('orders and combines severities with worst-wins', () => {
    expect(severityRank('hazardous')).toBeGreaterThan(severityRank('good'));
    expect(worseBand('moderate', 'unhealthy')).toBe('unhealthy');
    expect(worseBand('hazardous', 'sensitive')).toBe('hazardous');
  });

  it('gives every band a distinct colour and glyph', () => {
    const solids = Object.values(BAND_COLOURS).map((colour) => colour.solid);
    const glyphs = Object.values(BAND_COLOURS).map((colour) => colour.glyph);
    expect(new Set(solids).size).toBe(solids.length);
    expect(new Set(glyphs).size).toBe(glyphs.length);
  });
});

describe('cigarette equivalence', () => {
  it('uses the stated 22 µg/m³ approximation', () => {
    expect(cigaretteEquivalent(22)).toBe(1);
    expect(cigaretteEquivalent(11)).toBe(0.5);
    expect(cigaretteEquivalent(0)).toBe(0);
    expect(cigaretteEquivalent(Number.NaN)).toBe(0);
  });
});
