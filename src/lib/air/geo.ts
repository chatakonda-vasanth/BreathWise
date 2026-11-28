/**
 * Coordinate handling.
 *
 * Privacy: coordinates are rounded to 2 decimals (~1.1 km) *before* any
 * third-party call, and are never logged or persisted.
 */

export const LAT_MIN = -90;
export const LAT_MAX = 90;
export const LON_MIN = -180;
export const LON_MAX = 180;

/** Round to 2 decimal places without float drift (e.g. 19.07609 -> 19.08). */
export function roundCoord(value: number): number {
  // Number(value.toFixed(2)) is used instead of Math.round(v*100)/100 so that
  // values such as 1.005 round the way a human expects and stay finite.
  const rounded = Number(value.toFixed(2));
  // Normalise -0 to 0 so equality checks and snapshots are stable.
  return Object.is(rounded, -0) ? 0 : rounded;
}

/**
 * Whether a latitude is a finite number in range.
 */
export function isValidLatitude(value: number): boolean {
  return Number.isFinite(value) && value >= LAT_MIN && value <= LAT_MAX;
}

/**
 * Whether a longitude is a finite number in range.
 */
export function isValidLongitude(value: number): boolean {
  return Number.isFinite(value) && value >= LON_MIN && value <= LON_MAX;
}

export interface RoundedCoords {
  lat: number;
  lon: number;
}

/**
 * Validate then round. Returns null for out-of-range or non-finite input so
 * callers must handle the failure explicitly instead of sending junk upstream.
 */
export function normaliseCoords(lat: number, lon: number): RoundedCoords | null {
  if (!isValidLatitude(lat) || !isValidLongitude(lon)) return null;
  return { lat: roundCoord(lat), lon: roundCoord(lon) };
}

/** Stable cache key for a rounded coordinate pair. */
export function coordCacheKey(lat: number, lon: number): string {
  return `${roundCoord(lat).toFixed(2)},${roundCoord(lon).toFixed(2)}`;
}
