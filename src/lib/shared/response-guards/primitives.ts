import type { Language, NaqiBand, SeverityBand, UsBand } from '@/lib/shared/types';

/**
 * Structural guards for the API response bodies the browser consumes.
 *
 * These replace `zod` on the client. Zod stays on the server, where it is a
 * security boundary; in the browser the job is narrower — refuse to render a
 * response whose shape is wrong instead of throwing a TypeError in a component.
 */

export const US_BANDS: ReadonlySet<string> = new Set<UsBand>([
  'good',
  'moderate',
  'usg',
  'unhealthy',
  'veryUnhealthy',
  'hazardous',
]);

export const SEVERITY_BANDS: ReadonlySet<string> = new Set<SeverityBand>([
  'good',
  'moderate',
  'sensitive',
  'unhealthy',
  'veryUnhealthy',
  'hazardous',
]);

export const NAQI_BANDS: ReadonlySet<string> = new Set<NaqiBand>([
  'good',
  'satisfactory',
  'moderate',
  'poor',
  'veryPoor',
  'severe',
]);

export const LANGUAGES: ReadonlySet<string> = new Set<Language>(['en', 'hi', 'te']);
export const POLLUTANTS = new Set(['pm25', 'pm10', 'no2', 'o3']);
export const CONFIDENCE = new Set(['High', 'Medium', 'Low']);
export const PROVENANCE = new Set(['llm', 'fallback']);

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function isNumberOrNull(value: unknown): boolean {
  return value === null || (typeof value === 'number' && Number.isFinite(value));
}

export function isFiniteNumber(value: unknown): boolean {
  return typeof value === 'number' && Number.isFinite(value);
}

export function isNonEmptyString(value: unknown): boolean {
  return typeof value === 'string' && value.trim().length > 0;
}

export function isArrayOf(value: unknown, guard: (item: unknown) => boolean): boolean {
  return Array.isArray(value) && value.every(guard);
}
