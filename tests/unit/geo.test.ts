import { describe, expect, it } from 'vitest';
import {
  coordCacheKey,
  isValidLatitude,
  isValidLongitude,
  normaliseCoords,
  roundCoord,
} from '@/lib/air/geo';

describe('coordinate rounding', () => {
  it('rounds to two decimals', () => {
    expect(roundCoord(19.07609)).toBe(19.08);
    expect(roundCoord(72.87766)).toBe(72.88);
    expect(roundCoord(-33.8688)).toBe(-33.87);
    expect(roundCoord(0)).toBe(0);
  });

  it('normalises negative zero', () => {
    expect(Object.is(roundCoord(-0.001), 0)).toBe(true);
  });

  it('rejects out-of-range and non-finite coordinates', () => {
    expect(normaliseCoords(91, 0)).toBeNull();
    expect(normaliseCoords(0, 181)).toBeNull();
    expect(normaliseCoords(Number.NaN, 0)).toBeNull();
    expect(normaliseCoords(Number.POSITIVE_INFINITY, 0)).toBeNull();
  });

  it('returns rounded coordinates for valid input', () => {
    expect(normaliseCoords(19.07609, 72.87766)).toEqual({ lat: 19.08, lon: 72.88 });
  });

  it('validates ranges', () => {
    expect(isValidLatitude(-90)).toBe(true);
    expect(isValidLatitude(90.01)).toBe(false);
    expect(isValidLongitude(180)).toBe(true);
    expect(isValidLongitude(-180.5)).toBe(false);
  });

  it('builds a stable cache key', () => {
    expect(coordCacheKey(19.076, 72.877)).toBe('19.08,72.88');
    expect(coordCacheKey(19.084, 72.881)).toBe('19.08,72.88');
  });
});
