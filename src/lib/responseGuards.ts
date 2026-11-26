import type { AirResponse, GeocodeResponse } from './apiSchemas';
import { isAskQuestion } from './askQuestions';
import type { AnswerResponse, PlanResponse } from './schemas';
import type { Language, SeverityBand, UsBand, NaqiBand } from './types';

/**
 * Structural guards for the three API responses the browser consumes.
 *
 * These replace `zod` on the client. Zod stays on the server, where it is a
 * security boundary (it parses untrusted input); in the browser the job is
 * narrower — refuse to render a response whose shape is wrong instead of
 * throwing a TypeError deep in a component. A hand-written guard costs ~2 KiB
 * instead of ~40 KiB of schema runtime, and the shapes are small and closed.
 *
 * What is checked: every key the UI reads, its type, and the closed enum
 * values. What is not checked: the length caps the server enforces. That is a
 * deliberate difference — a too-long string from our own origin is a bug, not
 * an attack, and the server already rejects it.
 */

const US_BANDS: ReadonlySet<string> = new Set<UsBand>([
  'good',
  'moderate',
  'usg',
  'unhealthy',
  'veryUnhealthy',
  'hazardous',
]);

const SEVERITY_BANDS: ReadonlySet<string> = new Set<SeverityBand>([
  'good',
  'moderate',
  'sensitive',
  'unhealthy',
  'veryUnhealthy',
  'hazardous',
]);

const NAQI_BANDS: ReadonlySet<string> = new Set<NaqiBand>([
  'good',
  'satisfactory',
  'moderate',
  'poor',
  'veryPoor',
  'severe',
]);

const LANGUAGES: ReadonlySet<string> = new Set<Language>(['en', 'hi', 'te']);
const POLLUTANTS = new Set(['pm25', 'pm10', 'no2', 'o3']);
const CONFIDENCE = new Set(['High', 'Medium', 'Low']);
const PROVENANCE = new Set(['llm', 'fallback']);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNumberOrNull(value: unknown): boolean {
  return value === null || (typeof value === 'number' && Number.isFinite(value));
}

function isFiniteNumber(value: unknown): boolean {
  return typeof value === 'number' && Number.isFinite(value);
}

function isNonEmptyString(value: unknown): boolean {
  return typeof value === 'string' && value.trim().length > 0;
}

function isArrayOf(value: unknown, guard: (item: unknown) => boolean): boolean {
  return Array.isArray(value) && value.every(guard);
}

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

function isDerived(value: unknown): boolean {
  if (!isRecord(value)) return false;
  const naqi = value.naqi;
  if (!isRecord(naqi)) return false;
  return (
    isFiniteNumber(value.usAqi) &&
    typeof value.usBand === 'string' &&
    US_BANDS.has(value.usBand) &&
    isFiniteNumber(naqi.value) &&
    typeof naqi.band === 'string' &&
    NAQI_BANDS.has(naqi.band) &&
    typeof naqi.dominantPollutant === 'string' &&
    POLLUTANTS.has(naqi.dominantPollutant) &&
    isRecord(naqi.subIndices) &&
    Object.values(naqi.subIndices).every(isFiniteNumber) &&
    typeof value.severity === 'string' &&
    SEVERITY_BANDS.has(value.severity) &&
    isNumberOrNull(value.changeSinceYesterday)
  );
}

/** True when `value` is a complete `/api/air` body. */
export function isAirResponse(value: unknown): value is AirResponse {
  return isRecord(value) && isAirSnapshot(value.air) && isDerived(value.indices);
}

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

function isImpact(value: unknown): boolean {
  if (!isRecord(value)) return false;
  return (
    isNonEmptyString(value.mechanism) &&
    isNonEmptyString(value.estimatedReduction) &&
    isNonEmptyString(value.assumption) &&
    typeof value.confidence === 'string' &&
    CONFIDENCE.has(value.confidence)
  );
}

function isRecommendation(value: unknown): boolean {
  if (!isRecord(value)) return false;
  return (
    isNonEmptyString(value.title) &&
    isNonEmptyString(value.detail) &&
    isImpact(value.impact)
  );
}

/** "What this means" block: three sentences, all non-empty. */
function isPlanMeaning(value: unknown): boolean {
  if (!isRecord(value)) return false;
  return (
    isNonEmptyString(value.text) &&
    isNonEmptyString(value.cigaretteEquivalent) &&
    isNonEmptyString(value.assumption)
  );
}

/** The four guidance paragraphs every plan carries. */
function isPlanGuidance(value: Record<string, unknown>): boolean {
  return (
    isNonEmptyString(value.bestTimeToGoOut) &&
    isNonEmptyString(value.maskGuidance) &&
    isNonEmptyString(value.schoolAndCommute) &&
    isNonEmptyString(value.exerciseTiming)
  );
}

/** Provenance and the optional medical alert. */
function isPlanProvenance(value: Record<string, unknown>): boolean {
  return (
    (value.medicalAlert === null || typeof value.medicalAlert === 'string') &&
    typeof value.generatedBy === 'string' &&
    PROVENANCE.has(value.generatedBy) &&
    (value.fallbackReason === undefined || typeof value.fallbackReason === 'string')
  );
}

function isPlan(value: unknown): boolean {
  if (!isRecord(value)) return false;
  return (
    typeof value.language === 'string' &&
    LANGUAGES.has(value.language) &&
    typeof value.severity === 'string' &&
    SEVERITY_BANDS.has(value.severity) &&
    isNonEmptyString(value.headline) &&
    isPlanMeaning(value.whatThisMeans) &&
    isPlanGuidance(value) &&
    isArrayOf(value.indoorHacks, isRecommendation) &&
    isArrayOf(value.sustainableAlternatives, isRecommendation) &&
    isPlanProvenance(value)
  );
}

function isPlanMeta(value: unknown): boolean {
  if (!isRecord(value)) return false;
  return (
    typeof value.generatedBy === 'string' &&
    PROVENANCE.has(value.generatedBy) &&
    (value.fallbackReason === undefined || typeof value.fallbackReason === 'string') &&
    typeof value.cacheable === 'boolean'
  );
}

function isPlanAir(value: unknown): boolean {
  if (!isRecord(value)) return false;
  return (
    isFiniteNumber(value.lat) &&
    isFiniteNumber(value.lon) &&
    typeof value.timezone === 'string' &&
    typeof value.fetchedAt === 'string' &&
    isFiniteNumber(value.usAqi) &&
    isFiniteNumber(value.naqi) &&
    isNumberOrNull(value.pm25) &&
    typeof value.severity === 'string' &&
    typeof value.sample === 'boolean'
  );
}

/** True when `value` is a complete `/api/plan` body. */
export function isPlanResponse(value: unknown): value is PlanResponse {
  return (
    isRecord(value) &&
    isPlan(value.plan) &&
    isPlanAir(value.air) &&
    isPlanMeta(value.meta)
  );
}

/** One answered quick question: closed question, text, provenance. */
function isPlanAnswer(value: unknown): boolean {
  if (!isRecord(value)) return false;
  return (
    isAskQuestion(value.question) &&
    typeof value.language === 'string' &&
    LANGUAGES.has(value.language) &&
    isNonEmptyString(value.text) &&
    typeof value.generatedBy === 'string' &&
    PROVENANCE.has(value.generatedBy) &&
    (value.fallbackReason === undefined || typeof value.fallbackReason === 'string')
  );
}

/** True when `value` is a complete quick-question `/api/plan` body. */
export function isAnswerResponse(value: unknown): value is AnswerResponse {
  return (
    isRecord(value) &&
    isPlanAnswer(value.answer) &&
    isPlanAir(value.air) &&
    isPlanMeta(value.meta)
  );
}
