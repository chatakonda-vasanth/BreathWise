import { DEFAULT_GEMINI_MODEL } from './constants';
import { readEnv } from './env';
import { isValidOrigin } from './http';
import { warnMemoryLimiterOnce } from './rateLimit';

/**
 * Startup configuration check.
 *
 * It reports **names** and consequences only. Values are never read into a log
 * line, formatted, truncated or partially masked, because a masked key is still
 * a leak in shared logs.
 */

export const REQUIRED_ENV = [
  'GEMINI_API_KEY',
  'GEMINI_MODEL',
  'UPSTASH_REDIS_REST_URL',
  'UPSTASH_REDIS_REST_TOKEN',
] as const;

export type RequiredEnvName = (typeof REQUIRED_ENV)[number];

export type EnvSource = Record<string, string | undefined>;

export interface EnvReport {
  /** Required variables that are unset or blank. */
  missing: RequiredEnvName[];
  production: boolean;
  /** Missing key → the deterministic plan, never a crash. */
  llmDisabled: boolean;
  /** Production without Upstash → paid route falls back, other routes 503. */
  rateLimitingDisabled: boolean;
  /**
   * `unset` = same-origin checks use the request Host (safe default).
   * `invalid` = the value is not an absolute http(s) origin, so every POST is
   * rejected (fail closed).
   */
  appOrigin: 'unset' | 'valid' | 'invalid';
}

/**
 * Snapshot of the configuration names this check reports on.
 *
 * Built through `readEnv` (dynamic lookup) rather than read as `process.env`
 * literals, so the startup report reflects the running Worker's secrets instead
 * of build-time values baked into the bundle.
 */
function liveEnvSource(): EnvSource {
  const source: EnvSource = {};
  const nodeEnv = process.env.NODE_ENV;
  if (nodeEnv !== undefined) source.NODE_ENV = nodeEnv;
  for (const name of [...REQUIRED_ENV, 'APP_ORIGIN'] as const) {
    const value = readEnv(name);
    if (value !== undefined) source[name] = value;
  }
  return source;
}

function isSet(source: EnvSource, name: RequiredEnvName): boolean {
  return Boolean(source[name]?.trim());
}

/**
 * Classify the environment without reading
 * secrets into logs. Pure: pass a source object in tests.
 */
export function inspectEnv(
  source: EnvSource = liveEnvSource(),
  production: boolean = source.NODE_ENV === 'production',
): EnvReport {
  const missing = REQUIRED_ENV.filter((name) => !isSet(source, name));
  const upstashMissing =
    !isSet(source, 'UPSTASH_REDIS_REST_URL') ||
    !isSet(source, 'UPSTASH_REDIS_REST_TOKEN');

  const appOriginRaw = source.APP_ORIGIN?.trim();

  return {
    missing: [...missing],
    production,
    llmDisabled: !isSet(source, 'GEMINI_API_KEY'),
    rateLimitingDisabled: production && upstashMissing,
    appOrigin: !appOriginRaw
      ? 'unset'
      : isValidOrigin(appOriginRaw)
        ? 'valid'
        : 'invalid',
  };
}

function consequenceOf(name: RequiredEnvName, production: boolean): string {
  switch (name) {
    case 'GEMINI_API_KEY':
      return (
        'The AI path is disabled; every plan uses the built-in rule-based ' +
        'fallback. The app stays up and no model is called.'
      );
    case 'GEMINI_MODEL':
      return (
        `The built-in default model id (${DEFAULT_GEMINI_MODEL}) is used. ` +
        'Set it explicitly in production so a model change is a config change.'
      );
    case 'UPSTASH_REDIS_REST_URL':
    case 'UPSTASH_REDIS_REST_TOKEN':
      return production
        ? 'Rate limiting cannot be enforced, so /api/plan returns the labelled ' +
            'rule-based plan (HTTP 200, no model call) and /api/air and ' +
            '/api/geocode return 503. Set both Upstash variables in production.'
        : 'Using the per-instance in-memory limiter, which is development-only. ' +
            'Production requires Upstash.';
  }
}

/**
 * Log the startup report. Returns the structured result so callers (and tests)
 * can assert on it without parsing console output.
 */
export function reportEnv(source: EnvSource = liveEnvSource()): EnvReport {
  const report = inspectEnv(source, source.NODE_ENV === 'production');

  for (const name of report.missing) {
    const prefix = report.production ? 'error' : 'warning';
    console.error(
      `[cleanair] startup config ${prefix}: ${name} is not set. ` +
        consequenceOf(name, report.production),
    );
  }

  if (report.appOrigin === 'invalid') {
    // The route fails closed on this, so a typo here takes the paid route down.
    // The value itself is not a secret, but it is not logged either: the name
    // and the expected shape are enough to fix it.
    const prefix = report.production ? 'error' : 'warning';
    console.error(
      `[cleanair] startup config ${prefix}: APP_ORIGIN is set but is not an ` +
        'absolute http(s) origin (expected e.g. https://app.example.com, with a ' +
        'scheme, no path and no trailing whitespace). Every POST to /api/plan is ' +
        'rejected with 403 until it is fixed or the variable is unset.',
    );
  }

  if (report.rateLimitingDisabled) {
    console.error(
      '[cleanair] startup config error: rate limiting is disabled because Upstash ' +
        'is not configured. The paid route will not call the model, and the public ' +
        'API routes will answer 503 until UPSTASH_REDIS_REST_URL and ' +
        'UPSTASH_REDIS_REST_TOKEN are set.',
    );
  } else if (!report.production) {
    const upstashMissing = report.missing.some(
      (name) => name === 'UPSTASH_REDIS_REST_URL' || name === 'UPSTASH_REDIS_REST_TOKEN',
    );
    if (upstashMissing) warnMemoryLimiterOnce();
  }

  return report;
}
