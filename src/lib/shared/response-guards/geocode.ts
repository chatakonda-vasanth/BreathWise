import type { GeocodeResponse } from '@/lib/shared/apiSchemas';
import { isArrayOf, isFiniteNumber, isNonEmptyString, isRecord } from './primitives';

function isGeocodeResult(value: unknown): boolean {
  if (!isRecord(value)) return false;
  return (
    isFiniteNumber(value.id) &&
    isNonEmptyString(value.name) &&
    typeof value.country === 'string' &&
    (value.admin1 === undefined || typeof value.admin1 === 'string') &&
    isFiniteNumber(value.lat) &&
    isFiniteNumber(value.lon) &&
    typeof value.timezone === 'string'
  );
}

/** True when `value` is a complete `/api/geocode` body. */
export function isGeocodeResponse(value: unknown): value is GeocodeResponse {
  return isRecord(value) && isArrayOf(value.results, isGeocodeResult);
}
