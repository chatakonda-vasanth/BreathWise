import type { AirResponse } from '@/lib/shared/apiSchemas';
import {
  NAQI_BANDS,
  POLLUTANTS,
  SEVERITY_BANDS,
  US_BANDS,
  isArrayOf,
  isFiniteNumber,
  isNumberOrNull,
  isRecord,
} from './primitives';

function isAirPoint(value: unknown): boolean {
  if (!isRecord(value)) return false;
  return (
    typeof value.time === 'string' &&
    isNumberOrNull(value.usAqi) &&
    isNumberOrNull(value.pm25) &&
    isNumberOrNull(value.pm10) &&
    isNumberOrNull(value.no2) &&
    isNumberOrNull(value.o3)
  );
}

function isAirSnapshot(value: unknown): boolean {
  if (!isRecord(value)) return false;
  return (
    isFiniteNumber(value.lat) &&
    isFiniteNumber(value.lon) &&
    typeof value.timezone === 'string' &&
    typeof value.fetchedAt === 'string' &&
    isAirPoint(value.current) &&
    isArrayOf(value.history, isAirPoint) &&
    isArrayOf(value.forecast, isAirPoint) &&
    typeof value.source === 'string' &&
    typeof value.isSample === 'boolean'
  );
}

/** The NAQI block: value, band, dominant pollutant and the sub-indices. */
function isNaqiResult(value: unknown): boolean {
  if (!isRecord(value)) return false;
  return (
    isFiniteNumber(value.value) &&
    typeof value.band === 'string' &&
    NAQI_BANDS.has(value.band) &&
    typeof value.dominantPollutant === 'string' &&
    POLLUTANTS.has(value.dominantPollutant) &&
    isRecord(value.subIndices) &&
    Object.values(value.subIndices).every(isFiniteNumber)
  );
}

/** The derived block: both indices, the severity band and yesterday's change. */
function isDerived(value: unknown): boolean {
  if (!isRecord(value)) return false;
  return (
    isFiniteNumber(value.usAqi) &&
    typeof value.usBand === 'string' &&
    US_BANDS.has(value.usBand) &&
    isNaqiResult(value.naqi) &&
    typeof value.severity === 'string' &&
    SEVERITY_BANDS.has(value.severity) &&
    isNumberOrNull(value.changeSinceYesterday)
  );
}

/** True when `value` is a complete `/api/air` body. */
export function isAirResponse(value: unknown): value is AirResponse {
  return isRecord(value) && isAirSnapshot(value.air) && isDerived(value.indices);
}
