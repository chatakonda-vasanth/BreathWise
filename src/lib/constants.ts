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
/** LLM gets a longer budget but still bounded. */
export const LLM_TIMEOUT_MS = 20000;

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

/** Default daily LLM cap when DAILY_LLM_CAP is unset/invalid. */
export const DEFAULT_DAILY_LLM_CAP = 200;
/** Default model when GEMINI_MODEL is unset. Overridable without a code change. */
export const DEFAULT_GEMINI_MODEL = 'gemini-2.5-flash';

export const LANGUAGES = ['en', 'hi', 'te'] as const;
