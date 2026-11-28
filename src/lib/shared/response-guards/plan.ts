import { isAskQuestion } from '@/lib/ai/askQuestions';
import type { AnswerResponse, PlanResponse } from '@/lib/shared/schemas';
import {
  CONFIDENCE,
  LANGUAGES,
  PROVENANCE,
  SEVERITY_BANDS,
  isArrayOf,
  isFiniteNumber,
  isNonEmptyString,
  isNumberOrNull,
  isRecord,
} from './primitives';

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

/** Language, severity and headline: the fields every plan must carry. */
function isPlanIdentity(value: Record<string, unknown>): boolean {
  return (
    typeof value.language === 'string' &&
    LANGUAGES.has(value.language) &&
    typeof value.severity === 'string' &&
    SEVERITY_BANDS.has(value.severity) &&
    isNonEmptyString(value.headline)
  );
}

function isPlan(value: unknown): boolean {
  if (!isRecord(value)) return false;
  return (
    isPlanIdentity(value) &&
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
