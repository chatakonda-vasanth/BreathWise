import { describe, expect, it } from 'vitest';
import {
  no2UsAqi,
  o3UsAqi,
  overallUsAqi,
  pm10UsAqi,
  pm25UsAqi,
  severityRank,
  usBand,
  usBandToSeverity,
  worseBand,
} from '@/lib/air/aqi';
import {
  naqiBand,
  naqiBandToSeverity,
  naqiFromConcentrations,
  no2SubIndex,
  o3SubIndex,
  pm10SubIndex,
  pm25SubIndex,
} from '@/lib/air/naqi';

/**
 * Band boundaries are the part of the maths most likely to be changed by hand.
 * Every category is asserted on both sides of every cut point, plus 0, the
 * documented maximum, values beyond it and NaN.
 */

describe('US AQI band edges', () => {
  const cases: Array<[number, string]> = [
    [0, 'good'],
    [49, 'good'],
    [50, 'good'],
    [51, 'moderate'],
    [99, 'moderate'],
    [100, 'moderate'],
    [101, 'usg'],
    [149, 'usg'],
    [150, 'usg'],
    [151, 'unhealthy'],
    [199, 'unhealthy'],
    [200, 'unhealthy'],
    [201, 'veryUnhealthy'],
    [299, 'veryUnhealthy'],
    [300, 'veryUnhealthy'],
    [301, 'hazardous'],
    [500, 'hazardous'],
    [501, 'hazardous'],
    [10_000, 'hazardous'],
  ];

  it.each(cases)('usBand(%i) is %s', (aqi, band) => {
    expect(usBand(aqi)).toBe(band);
  });

  it('treats NaN as the lowest band rather than throwing', () => {
    // NaN fails every `<=` comparison, so the final branch is taken. Asserting
    // the actual behaviour documents it instead of leaving it to chance.
    expect(usBand(Number.NaN)).toBe('hazardous');
    expect(usBand(Number.NEGATIVE_INFINITY)).toBe('good');
  });

  it('maps every band onto the unified severity scale', () => {
    expect(usBandToSeverity('good')).toBe('good');
    expect(usBandToSeverity('moderate')).toBe('moderate');
    expect(usBandToSeverity('usg')).toBe('sensitive');
    expect(usBandToSeverity('unhealthy')).toBe('unhealthy');
    expect(usBandToSeverity('veryUnhealthy')).toBe('veryUnhealthy');
    expect(usBandToSeverity('hazardous')).toBe('hazardous');
  });

  it('ranks every band in order, so worst-wins is total', () => {
    const order = [
      'good',
      'moderate',
      'sensitive',
      'unhealthy',
      'veryUnhealthy',
      'hazardous',
    ] as const;
    order.forEach((band, index) => {
      expect(severityRank(band)).toBe(index);
      for (const other of order) {
        const expected = index >= severityRank(other) ? band : other;
        expect(worseBand(band, other)).toBe(expected);
      }
    });
  });
});

describe('US AQI pollutant breakpoints at both edges', () => {
  it('PM2.5 covers 0, 500 and far beyond the table', () => {
    expect(pm25UsAqi(0)).toBe(0);
    expect(pm25UsAqi(325.4)).toBe(500);
    expect(pm25UsAqi(325.5)).toBe(500);
    expect(pm25UsAqi(100_000)).toBe(500);
    expect(pm25UsAqi(Number.NaN)).toBe(0);
    expect(pm25UsAqi(-0.0001)).toBe(0);
  });

  it('PM10 covers 0, the last breakpoint and beyond', () => {
    expect(pm10UsAqi(0)).toBe(0);
    expect(pm10UsAqi(54)).toBe(50);
    expect(pm10UsAqi(55)).toBe(51);
    expect(pm10UsAqi(1000)).toBe(500);
    expect(pm10UsAqi(1001)).toBe(500);
    expect(pm10UsAqi(Number.NaN)).toBe(0);
  });

  it('NO2 and O3 cover 0, band edges and beyond', () => {
    expect(no2UsAqi(0)).toBe(0);
    expect(no2UsAqi(53)).toBe(50);
    expect(no2UsAqi(54)).toBe(51);
    expect(no2UsAqi(4000)).toBe(500);
    expect(no2UsAqi(4001)).toBe(500);
    expect(no2UsAqi(Number.NaN)).toBe(0);

    expect(o3UsAqi(0)).toBe(0);
    expect(o3UsAqi(106)).toBe(50);
    expect(o3UsAqi(107)).toBe(51);
    expect(o3UsAqi(1200)).toBe(500);
    expect(o3UsAqi(1201)).toBe(500);
    expect(o3UsAqi(Number.NaN)).toBe(0);
  });

  it('overallUsAqi ignores NaN sub-indices instead of poisoning the maximum', () => {
    // NaN must not win `Math.max`; the finite sub-index decides.
    expect(overallUsAqi({ pm25: Number.NaN, pm10: 154 })).toBe(pm10UsAqi(154));
    expect(overallUsAqi({ pm25: null, pm10: null })).toBe(0);
    expect(overallUsAqi({})).toBe(0);
    expect(overallUsAqi({ no2: 1000, o3: 20 })).toBe(no2UsAqi(1000));
  });
});

describe('NAQI band edges', () => {
  const cases: Array<[number, string]> = [
    [0, 'good'],
    [49, 'good'],
    [50, 'good'],
    [51, 'satisfactory'],
    [100, 'satisfactory'],
    [101, 'moderate'],
    [200, 'moderate'],
    [201, 'poor'],
    [300, 'poor'],
    [301, 'veryPoor'],
    [400, 'veryPoor'],
    [401, 'severe'],
    [500, 'severe'],
    [501, 'severe'],
    [10_000, 'severe'],
  ];

  it.each(cases)('naqiBand(%i) is %s', (index, band) => {
    expect(naqiBand(index)).toBe(band);
  });

  it('documents the NaN behaviour', () => {
    expect(naqiBand(Number.NaN)).toBe('severe');
  });

  it('maps every NAQI band onto the unified severity scale', () => {
    expect(naqiBandToSeverity('good')).toBe('good');
    expect(naqiBandToSeverity('satisfactory')).toBe('moderate');
    expect(naqiBandToSeverity('moderate')).toBe('sensitive');
    expect(naqiBandToSeverity('poor')).toBe('unhealthy');
    expect(naqiBandToSeverity('veryPoor')).toBe('veryUnhealthy');
    expect(naqiBandToSeverity('severe')).toBe('hazardous');
  });
});

describe('NAQI sub-indices at both edges', () => {
  it.each([
    ['pm25', pm25SubIndex, 30, 1000],
    ['pm10', pm10SubIndex, 50, 1500],
    ['no2', no2SubIndex, 40, 2000],
    ['o3', o3SubIndex, 50, 2000],
  ] as const)('%s clamps at 0 and 500', (_name, fn, firstEdge, lastEdge) => {
    expect(fn(0)).toBe(0);
    expect(fn(firstEdge)).toBe(50);
    expect(fn(lastEdge)).toBe(500);
    expect(fn(lastEdge + 1)).toBe(500);
    expect(fn(Number.NaN)).toBe(0);
    expect(fn(-1)).toBe(0);
  });

  it('reports the dominant pollutant when several are present', () => {
    const ozone = naqiFromConcentrations({ pm25: 10, o3: 1000 });
    expect(ozone.dominantPollutant).toBe('o3');
    expect(ozone.value).toBe(o3SubIndex(1000));
    expect(ozone.band).toBe('severe');
  });

  it('returns zero for an empty snapshot', () => {
    const empty = naqiFromConcentrations({});
    expect(empty.value).toBe(0);
    expect(empty.band).toBe('good');
    expect(empty.subIndices).toEqual({ pm25: 0, pm10: 0, no2: 0, o3: 0 });
  });

  it('never exceeds 500 when a concentration is far past the table', () => {
    const extreme = naqiFromConcentrations({
      pm25: 100_000,
      pm10: 100_000,
      no2: 100_000,
      o3: 100_000,
    });
    expect(extreme.value).toBe(500);
    expect(extreme.band).toBe('severe');
  });
});
