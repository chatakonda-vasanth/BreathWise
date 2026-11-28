import { describe, expect, it } from 'vitest';
import {
  naqiBand,
  naqiBandToSeverity,
  naqiFromConcentrations,
  no2SubIndex,
  o3SubIndex,
  pm10SubIndex,
  pm25SubIndex,
} from '@/lib/air/naqi';

describe('CPCB NAQI sub-indices', () => {
  it('maps PM2.5 breakpoints to sub-index values', () => {
    expect(pm25SubIndex(0)).toBe(0);
    expect(pm25SubIndex(30)).toBe(50);
    expect(pm25SubIndex(60)).toBe(100);
    expect(pm25SubIndex(90)).toBe(200);
    expect(pm25SubIndex(120)).toBe(300);
    expect(pm25SubIndex(250)).toBe(400);
    expect(pm25SubIndex(1000)).toBe(500);
    // Anything above 250 falls in the severe 401–500 band.
    expect(pm25SubIndex(400)).toBeGreaterThan(400);
    expect(pm25SubIndex(400)).toBeLessThanOrEqual(500);
  });

  it('maps PM10 breakpoints', () => {
    expect(pm10SubIndex(50)).toBe(50);
    expect(pm10SubIndex(100)).toBe(100);
    expect(pm10SubIndex(250)).toBe(200);
    expect(pm10SubIndex(350)).toBe(300);
  });

  it('maps NO2 and O3 breakpoints', () => {
    expect(no2SubIndex(40)).toBe(50);
    expect(no2SubIndex(80)).toBe(100);
    expect(o3SubIndex(50)).toBe(50);
    expect(o3SubIndex(100)).toBe(100);
  });

  it('never returns a value above 500 or below 0', () => {
    expect(pm25SubIndex(100000)).toBe(500);
    expect(pm25SubIndex(-1)).toBe(0);
  });
});

describe('NAQI categories', () => {
  it('uses the six CPCB bands', () => {
    expect(naqiBand(0)).toBe('good');
    expect(naqiBand(50)).toBe('good');
    expect(naqiBand(51)).toBe('satisfactory');
    expect(naqiBand(101)).toBe('moderate');
    expect(naqiBand(201)).toBe('poor');
    expect(naqiBand(301)).toBe('veryPoor');
    expect(naqiBand(401)).toBe('severe');
    expect(naqiBand(500)).toBe('severe');
  });

  it('reports the dominant pollutant and the overall index', () => {
    const result = naqiFromConcentrations({ pm25: 120, pm10: 90, no2: 10, o3: 10 });
    expect(result.dominantPollutant).toBe('pm25');
    expect(result.value).toBe(300);
    expect(result.band).toBe('poor');
    expect(result.subIndices.pm25).toBe(300);
  });

  it('handles missing pollutants', () => {
    const result = naqiFromConcentrations({ pm25: null, pm10: 100 });
    expect(result.value).toBe(100);
    expect(result.band).toBe('satisfactory');
  });

  it('maps NAQI bands onto the unified severity scale', () => {
    expect(naqiBandToSeverity('satisfactory')).toBe('moderate');
    expect(naqiBandToSeverity('moderate')).toBe('sensitive');
    expect(naqiBandToSeverity('poor')).toBe('unhealthy');
    expect(naqiBandToSeverity('severe')).toBe('hazardous');
  });
});
