/** App-wide constants. Single place for limits so routes and UI cannot drift. */

export const APP_NAME = 'CleanAir Companion';
export const AIR_SOURCE_LABEL = 'Open-Meteo Air Quality (CAMS)';
export const AIR_SOURCE_URL = 'https://open-meteo.com/';

/** Hard-coded upstream hosts. No user-supplied URL is ever fetched (SSRF guard). */
export const AIR_QUALITY_HOST = 'https://air-quality-api.open-meteo.com';
export const GEOCODING_HOST = 'https://geocoding-api.open-meteo.com';
export const GEMINI_HOST = 'https://generativelanguage.googleapis.com';

/** Outbound HTTP timeout (ms) for every third-party call. */
export const UPSTREAM_TIMEOUT_MS = 5000;

/**
 * Vercel function budget for /api/plan.
 *
 * Vercel's Hobby (free) plan allows up to 300 s per invocation — 300 s is both
 * the default and the maximum, so `maxDuration` cannot raise it (verified in
 * vercel.com/docs/functions/limitations, November 2026, Fluid compute). We ask
 * for far less on purpose: this route answers in seconds, and a shorter ceiling
 * bounds queue time and cost. Exceeding it yields Vercel's 504
 * FUNCTION_INVOCATION_TIMEOUT, which is exactly what the budget below avoids.
 */
export const FUNCTION_MAX_DURATION_S = 45;

/** Time kept back so the response is written before Vercel kills the function. */
export const ROUTE_RESPONSE_MARGIN_MS = 5000;

/**
 * Per-attempt LLM cap (ms). Live measurements on gemini-3.5-flash with
 * `thinkingLevel: low`: 10.1 s (en), 10.8 s (hi), 13.2 s (te). 18 s keeps ~5 s
 * of headroom over the slowest observed language instead of cutting it close.
 */
export const LLM_ATTEMPT_TIMEOUT_MS = 18000;

/**
 * Budget for all LLM attempts in one request (ms).
 *
 * Worst case end to end: 5 s air fetch + 25 s here + 5 s response margin = 35 s,
 * inside the 45 s `maxDuration`. 25 s is also the ceiling the UI quotes to the
 * user ("up to 25 seconds"), so the promise and the budget cannot drift apart.
 * A second attempt only runs when the first finished inside half of this budget
 * (see planService), so the retry can never push the request past the deadline.
 */
export const LLM_TOTAL_BUDGET_MS = 25000;

/** Never start another attempt with less than this much budget left. */
export const LLM_RETRY_MIN_REMAINING_MS = 4000;

/** Air snapshot cache TTL (10 min, inside the requested 10–15 min window). */
export const AIR_CACHE_TTL_MS = 10 * 60 * 1000;

/** Request body ceiling for POST routes (bytes). */
export const MAX_BODY_BYTES = 8 * 1024;

/** Field caps. */
export const MAX_CITY_QUERY = 60;
export const MAX_PLAN_STRING = 600;

/** Rate limits: requests per window (ms) per client IP. */
export const RATE_LIMITS = {
  air: { limit: 60, windowMs: 60_000 },
  geocode: { limit: 30, windowMs: 60_000 },
  plan: { limit: 6, windowMs: 60_000 },
} as const;

/**
 * Upstash Redis free tier, per upstash.com/docs/redis/overall/pricing and
 * /billing (read November 2026): 500,000 commands per month, 10,000 commands per
 * second, 256 MB, one database. Commands beyond the monthly allowance throw,
 * which this app treats as "limiter unreachable" and fails closed on.
 *
 * A plan request costs at most two sliding-window commands plus two daily-cap
 * commands (INCR, and EXPIRE on the first request of the day); an air or
 * geocode request costs at most two. The README works through the monthly
 * budget under normal use.
 */
export const UPSTASH_FREE_MONTHLY_COMMANDS = 500_000;
export const UPSTASH_COMMANDS_PER_PLAN_REQUEST = 4;
export const UPSTASH_COMMANDS_PER_READ_REQUEST = 2;

/** Default daily LLM cap when DAILY_LLM_CAP is unset/invalid. */
export const DEFAULT_DAILY_LLM_CAP = 200;
/** Default model when GEMINI_MODEL is unset. Overridable without a code change. */
export const DEFAULT_GEMINI_MODEL = 'gemini-3.5-flash';

export const LANGUAGES = ['en', 'hi', 'te'] as const;
