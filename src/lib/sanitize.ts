import type { Language, Plan, Recommendation } from './types';

/**
 * Text sanitisation for anything that leaves our own code — chiefly LLM output.
 *
 * The UI renders all strings as React text nodes (no `dangerouslySetInnerHTML`),
 * so markup can never execute. This layer additionally strips markup so that a
 * model that emits `<script>` or `[link](javascript:…)` cannot produce broken or
 * misleading copy, and caps every string length.
 */

const CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;
const TAG_LIKE = /<\/?[a-zA-Z][^>]*>/g;
const SCRIPT_STYLE = /<(script|style|iframe|object|embed)\b[\s\S]*?<\/\1>/gi;
// Handles one level of nested parentheses, e.g. [x](javascript:alert(1)).
const MARKDOWN_LINK = /\[([^\]]{0,200})\]\((?:[^()]|\([^()]*\)){0,300}\)/g;
const ZERO_WIDTH = /[\u200B-\u200D\u2060\uFEFF]/g;

export function sanitizeText(input: string, maxLength: number): string {
  let value = typeof input === 'string' ? input : '';
  value = value.replace(SCRIPT_STYLE, ' ');
  value = value.replace(TAG_LIKE, ' ');
  value = value.replace(MARKDOWN_LINK, '$1');
  value = value.replace(ZERO_WIDTH, '');
  value = value.replace(CONTROL_CHARS, '');
  value = value.replace(/[ \t]{2,}/g, ' ');
  value = value.replace(/\n{3,}/g, '\n\n');
  value = value.trim();
  if (value.length > maxLength) value = `${value.slice(0, maxLength - 1).trimEnd()}…`;
  return value;
}

export function containsMarkup(value: string): boolean {
  return /<\/?[a-zA-Z][^>]*>/.test(value) || /javascript:/i.test(value);
}

// --- Medical safety -------------------------------------------------------

/**
 * Defence in depth on top of the system prompt: if the model still returns
 * medication/dosage/diagnosis content, the plan is rejected and the
 * deterministic fallback is served instead.
 */
const MEDICAL_PATTERNS: readonly RegExp[] = [
  /\b\d+(?:\.\d+)?\s?(?:mg|mcg|µg|ml|iu)\b/i,
  /\b(?:dosage|dose)\b/i,
  /\bprescri(?:be|ption|bed)\b/i,
  /\b(?:take|swallow)\s+(?:one|two|three|\d+)\s+(?:tablet|pill|puff|capsule)s?\b/i,
  /\b(?:tablets?|capsules?)\s+(?:daily|twice|thrice|per day|a day)\b/i,
  /\byou\s+(?:have|are\s+suffering\s+from|are\s+diagnosed\s+with)\b/i,
  /\bdiagnos(?:is|e|ed|tic)\b/i,
  /\b(?:paracetamol|ibuprofen|azithromycin|amoxicillin|cetirizine|montelukast|salbutamol|prednisolone|corticosteroid)\b/i,
];

export function looksLikeMedicalAdvice(text: string): boolean {
  return MEDICAL_PATTERNS.some((pattern) => pattern.test(text));
}

// --- Script checks --------------------------------------------------------

const DEVANAGARI = /[\u0900-\u097F]/;
const TELUGU = /[\u0C00-\u0C7F]/;
const LATIN = /[A-Za-z]/;

/** True when the text is in the script expected for the selected language. */
export function scriptMatches(language: Language, text: string): boolean {
  const sample = text.slice(0, 4000);
  if (language === 'hi') return !DEVANAGARI.test(sample) ? false : true;
  if (language === 'te') return !TELUGU.test(sample) ? false : true;
  // English output may legitimately contain a place name in another script.
  return LATIN.test(sample);
}

// --- Plan sanitisation ----------------------------------------------------

function sanitizeRecommendation(item: Recommendation): Recommendation {
  return {
    title: sanitizeText(item.title, 120),
    detail: sanitizeText(item.detail, 600),
    impact: {
      mechanism: sanitizeText(item.impact.mechanism, 300),
      estimatedReduction: sanitizeText(item.impact.estimatedReduction, 200),
      assumption: sanitizeText(item.impact.assumption, 300),
      confidence: item.impact.confidence,
    },
  };
}

/** Sanitise every string in a plan before it is returned or rendered. */
export function sanitizePlan(plan: Plan): Plan {
  return {
    ...plan,
    headline: sanitizeText(plan.headline, 200),
    whatThisMeans: {
      text: sanitizeText(plan.whatThisMeans.text, 800),
      cigaretteEquivalent: sanitizeText(plan.whatThisMeans.cigaretteEquivalent, 400),
      assumption: sanitizeText(plan.whatThisMeans.assumption, 400),
    },
    bestTimeToGoOut: sanitizeText(plan.bestTimeToGoOut, 500),
    maskGuidance: sanitizeText(plan.maskGuidance, 500),
    schoolAndCommute: sanitizeText(plan.schoolAndCommute, 500),
    exerciseTiming: sanitizeText(plan.exerciseTiming, 500),
    indoorHacks: plan.indoorHacks.map(sanitizeRecommendation),
    sustainableAlternatives: plan.sustainableAlternatives.map(sanitizeRecommendation),
    medicalAlert: plan.medicalAlert ? sanitizeText(plan.medicalAlert, 600) : null,
  };
}
