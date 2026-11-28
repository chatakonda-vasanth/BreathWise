import './zod-jitless';
import { z } from 'zod';
import { ASK_QUESTIONS } from '@/lib/ai/askQuestions';
import { MAX_CITY_QUERY, MAX_PLAN_STRING } from './constants';

/**
 * Every route parses its input with a strict schema: unknown fields are
 * rejected (`.strict()` / `z.strictObject`), strings are length-capped, enums
 * are closed, and numbers are range-checked. There is no free-text field in the
 * profile, so nothing user-typed can reach the LLM prompt.
 */

export const languageSchema = z.enum(['en', 'hi', 'te']);

/**
 * The closed set of quick questions. An enum, not a string: a caller cannot
 * send free text, so a prompt-injection payload is a 400 before any model call.
 */
export const askQuestionSchema = z.enum(ASK_QUESTIONS);

/** Numeric query-string parser: rejects "", "  ", "1e999", "0x10", "abc". */
const queryNumber = (min: number, max: number) =>
  z
    .string()
    .trim()
    .regex(/^-?\d{1,3}(\.\d{1,6})?$/, 'must be a plain decimal number')
    .transform((value) => Number(value))
    .refine((value) => Number.isFinite(value) && value >= min && value <= max, {
      message: `must be between ${min} and ${max}`,
    });

export const airQuerySchema = z
  .strictObject({
    lat: queryNumber(-90, 90),
    lon: queryNumber(-180, 180),
  })
  .strict();

export const geocodeQuerySchema = z
  .strictObject({
    q: z
      .string()
      .trim()
      .min(2, 'too short')
      .max(MAX_CITY_QUERY, 'too long')
      // Letters, digits, spaces, dots, hyphens and apostrophes only. Blocks
      // control characters, markup and prompt-injection punctuation.
      // Letters, combining marks (Devanagari/Telugu matras), digits, spaces,
      // dot, hyphen and apostrophe. No newlines, no control characters, no markup.
      .regex(/^[\p{L}\p{M}\p{N}][\p{L}\p{M}\p{N} .'’-]*$/u, 'invalid characters'),
  })
  .strict();

export const homeTypeSchema = z.enum(['apartment', 'house', 'other']);
export const windowsSchema = z.enum(['single', 'double', 'sealed', 'unknown']);
export const kitchenVentilationSchema = z.enum([
  'chimney',
  'exhaustFan',
  'window',
  'none',
  'unknown',
]);
export const commuteModeSchema = z.enum([
  'walk',
  'cycle',
  'bus',
  'metro',
  'twoWheeler',
  'car',
  'wfh',
]);
export const budgetSchema = z.enum(['low', 'medium', 'high']);

/** The quick profile. Session-only, held in React state, never sent to a DB. */
export const profileSchema = z
  .strictObject({
    adults: z.number().int().min(0).max(12),
    children: z.number().int().min(0).max(12),
    elderly: z.number().int().min(0).max(8),
    pregnant: z.boolean(),
    sensitiveGroup: z.boolean(),
    homeType: homeTypeSchema,
    windows: windowsSchema,
    kitchenVentilation: kitchenVentilationSchema,
    commuteMode: commuteModeSchema,
    budget: budgetSchema,
    language: languageSchema,
    /** Optional so the HEPA sizing hint degrades gracefully. */
    roomSizeSqm: z.number().min(5).max(200).optional(),
    symptoms: z.boolean(),
  })
  .strict();

export type Profile = z.infer<typeof profileSchema>;

/**
 * /api/plan request. Coordinates are re-fetched server-side: the client never
 * supplies the air data that the model reasons about.
 */
export const planRequestSchema = z
  .strictObject({
    profile: profileSchema,
    lat: z.number().min(-90).max(90),
    lon: z.number().min(-180).max(180),
    /**
     * Deliberately no location label / free-text field: the route needs only
     * coordinates (to fetch air data server-side) and the enumerated profile.
     * An accepted-but-unused text field would be needless attack surface.
     */
    /** Explicit demo mode: use the clearly labelled sample snapshot server-side. */
    sample: z.boolean().optional(),
    /** Optional quick question; answered through the same guardrails. */
    question: askQuestionSchema.optional(),
  })
  .strict();

export type PlanRequest = z.infer<typeof planRequestSchema>;

const confidenceSchema = z.enum(['High', 'Medium', 'Low']);

const shortText = (max: number) => z.string().trim().min(1).max(max);

export const recommendationSchema = z
  .strictObject({
    title: shortText(120),
    detail: shortText(MAX_PLAN_STRING),
    impact: z
      .strictObject({
        mechanism: shortText(300),
        estimatedReduction: shortText(200),
        assumption: shortText(300),
        confidence: confidenceSchema,
      })
      .strict(),
  })
  .strict();

/** What we require the model to return. Wrapped into a full Plan server-side. */
export const llmPlanSchema = z
  .strictObject({
    headline: shortText(160),
    whatThisMeans: shortText(700),
    cigaretteEquivalentNote: shortText(300),
    bestTimeToGoOut: shortText(400),
    maskGuidance: shortText(400),
    schoolAndCommute: shortText(400),
    exerciseTiming: shortText(400),
    indoorHacks: z.array(recommendationSchema).min(3).max(8),
    sustainableAlternatives: z.array(recommendationSchema).min(2).max(6),
  })
  .strict();

/** Full plan returned by /api/plan (LLM or deterministic fallback). */
export const planSchema = z
  .strictObject({
    language: languageSchema,
    severity: z.enum([
      'good',
      'moderate',
      'sensitive',
      'unhealthy',
      'veryUnhealthy',
      'hazardous',
    ]),
    headline: z.string().min(1).max(200),
    whatThisMeans: z
      .strictObject({
        text: z.string().min(1).max(800),
        cigaretteEquivalent: z.string().min(1).max(400),
        assumption: z.string().min(1).max(400),
      })
      .strict(),
    bestTimeToGoOut: z.string().min(1).max(500),
    maskGuidance: z.string().min(1).max(500),
    schoolAndCommute: z.string().min(1).max(500),
    exerciseTiming: z.string().min(1).max(500),
    indoorHacks: z.array(recommendationSchema).min(1).max(8),
    sustainableAlternatives: z.array(recommendationSchema).min(1).max(6),
    medicalAlert: z.string().max(600).nullable(),
    generatedBy: z.enum(['llm', 'fallback']),
    fallbackReason: z.string().max(60).optional(),
  })
  .strict();

export const planResponseSchema = z
  .strictObject({
    plan: planSchema,
    air: z
      .strictObject({
        lat: z.number(),
        lon: z.number(),
        timezone: z.string(),
        fetchedAt: z.string(),
        usAqi: z.number(),
        naqi: z.number(),
        pm25: z.number().nullable(),
        severity: z.string(),
        sample: z.boolean(),
      })
      .strict(),
    meta: z
      .strictObject({
        generatedBy: z.enum(['llm', 'fallback']),
        fallbackReason: z.string().optional(),
        cacheable: z.boolean(),
      })
      .strict(),
  })
  .strict();

export type PlanResponse = z.infer<typeof planResponseSchema>;

/** What the model must return for a quick question: one answer, nothing else. */
export const llmAnswerSchema = z
  .strictObject({
    answer: shortText(MAX_PLAN_STRING),
  })
  .strict();

/** One answered quick question, with provenance so the UI can label fallbacks. */
export const planAnswerSchema = z
  .strictObject({
    question: askQuestionSchema,
    language: languageSchema,
    text: z.string().min(1).max(MAX_PLAN_STRING),
    generatedBy: z.enum(['llm', 'fallback']),
    fallbackReason: z.string().max(60).optional(),
  })
  .strict();

export type PlanAnswerBody = z.infer<typeof planAnswerSchema>;

/** Same air and meta blocks as the plan response, so clients can share guards. */
export const answerResponseSchema = z
  .strictObject({
    answer: planAnswerSchema,
    air: planResponseSchema.shape.air,
    meta: planResponseSchema.shape.meta,
  })
  .strict();

export type AnswerResponse = z.infer<typeof answerResponseSchema>;

/** Safe parse helper that never throws and never echoes the input back. */
export function parseOrNull<T extends z.ZodType>(
  schema: T,
  value: unknown,
): z.infer<T> | null {
  const result = schema.safeParse(value);
  return result.success ? result.data : null;
}
