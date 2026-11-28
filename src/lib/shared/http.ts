import { readEnv } from './env';

/**
 * HTTP response primitives and same-origin enforcement.
 *
 * Client addresses live in `clientIp.ts` and bounded body reading in
 * `requestBody.ts`, so this module is only about the answers a route gives.
 */

/** Generic, non-leaking API responses. Clients never see internals. */
export type ErrorCode =
  | 'invalid_input'
  | 'forbidden_origin'
  | 'rate_limited'
  | 'upstream_unavailable'
  | 'body_too_large'
  | 'unsupported_media_type'
  | 'service_unavailable'
  | 'server_error';

const ERROR_MESSAGES: Record<ErrorCode, string> = {
  invalid_input: 'The request was not valid.',
  forbidden_origin: 'Request blocked.',
  rate_limited: 'Too many requests. Please wait and try again.',
  upstream_unavailable: 'Live air data is temporarily unavailable.',
  body_too_large: 'The request was too large.',
  unsupported_media_type: 'Unsupported content type.',
  service_unavailable:
    'The service is temporarily unavailable. Please try again shortly.',
  server_error: 'Something went wrong. Please try again.',
};

const ERROR_STATUS: Record<ErrorCode, number> = {
  invalid_input: 400,
  forbidden_origin: 403,
  rate_limited: 429,
  upstream_unavailable: 502,
  body_too_large: 413,
  unsupported_media_type: 415,
  service_unavailable: 503,
  server_error: 500,
};

/** Add the headers every API answer carries, whatever its status. */
function apiHeaders(extraHeaders?: HeadersInit): Headers {
  const headers = new Headers(extraHeaders);
  headers.set('Content-Type', 'application/json; charset=utf-8');
  headers.set('Cache-Control', 'no-store');
  headers.set('X-Content-Type-Options', 'nosniff');
  return headers;
}

/**
 * JSON error body with a short machine code and no internal detail.
 *
 * @param code Closed error code; the message and status come from the tables.
 * @param extraHeaders Additional headers such as `Retry-After`.
 */
export function errorResponse(code: ErrorCode, extraHeaders?: HeadersInit): Response {
  const body: { error: ErrorCode; message: string } = {
    error: code,
    message: ERROR_MESSAGES[code],
  };
  return new Response(JSON.stringify(body), {
    status: ERROR_STATUS[code],
    headers: apiHeaders(extraHeaders),
  });
}

/**
 * JSON success body. Always `Cache-Control: no-store`: API answers are
 * personalised or short-lived and must not be cached by the browser, a proxy or
 * a service worker.
 *
 * @param body Serializable response body.
 * @param status HTTP status, 200 by default.
 * @param extraHeaders Additional headers.
 */
export function jsonResponse(
  body: unknown,
  status = 200,
  extraHeaders?: HeadersInit,
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: apiHeaders(extraHeaders),
  });
}

export interface OriginCheck {
  ok: boolean;
  reason?: 'missing_origin' | 'mismatch' | 'cross_site' | 'invalid_config';
}

/**
 * Absolute http(s) origin of a URL string (`scheme://host[:port]`), or null.
 *
 * Used for both sides of the comparison so a trailing slash, a path or a
 * different scheme cannot make two different origins look equal.
 */
function absoluteOrigin(value: string): string | null {
  try {
    const url = new URL(value.trim());
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    if (url.hostname.length === 0) return null;
    return url.origin;
  } catch {
    return null;
  }
}

/** True when `value` is a usable APP_ORIGIN (absolute, http or https). */
export function isValidOrigin(value: string): boolean {
  return absoluteOrigin(value) !== null;
}

/** Compare against the origin the operator pinned in APP_ORIGIN. */
function matchesPinnedOrigin(requestOrigin: string, configured: string): OriginCheck {
  // Scheme, host and port must all match. An unparseable value fails closed
  // instead of silently unpinning the check.
  const configuredOrigin = absoluteOrigin(configured);
  if (!configuredOrigin) return { ok: false, reason: 'invalid_config' };
  return requestOrigin === configuredOrigin
    ? { ok: true }
    : { ok: false, reason: 'mismatch' };
}

/**
 * The host the client actually addressed, lower-cased, or an empty string.
 *
 * `Host` is a forbidden header name, so page script cannot forge it, and it is
 * what the browser's `Origin` was derived from. `x-forwarded-host` is only a
 * fallback for a proxy that rewrites Host, and its **last** entry is used: a
 * client can set `X-Forwarded-Host` in a fetch, and a proxy appends the host it
 * really forwarded to, so the last entry is the one that was vouched for.
 */
function addressedHost(request: Request): string {
  const hostHeader = request.headers.get('host')?.trim();
  if (hostHeader && hostHeader.length > 0) return hostHeader.toLowerCase();

  const forwardedHost = request.headers.get('x-forwarded-host');
  if (!forwardedHost) return '';
  const entries = forwardedHost
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
  return (entries[entries.length - 1] ?? '').toLowerCase();
}

/** Compare against the host the client actually addressed. */
function matchesRequestHost(request: Request, requestOrigin: string): OriginCheck {
  const expectedHost = addressedHost(request);
  if (expectedHost === '') return { ok: false, reason: 'mismatch' };
  return new URL(requestOrigin).host.toLowerCase() === expectedHost
    ? { ok: true }
    : { ok: false, reason: 'mismatch' };
}

/** Read-only requests cannot change state, so they are never origin-checked. */
function isSafeMethod(method: string): boolean {
  const upper = method.toUpperCase();
  return upper === 'GET' || upper === 'HEAD' || upper === 'OPTIONS';
}

/**
 * Reject a request the browser itself marked as cross-site.
 *
 * `Sec-Fetch-Site` is set by the browser and cannot be forged by page script,
 * so it settles the question before Origin is even read.
 */
function crossSiteRejection(request: Request): OriginCheck | null {
  const fetchSite = request.headers.get('sec-fetch-site');
  if (!fetchSite || fetchSite === 'same-origin' || fetchSite === 'none') return null;
  return { ok: false, reason: fetchSite === 'cross-site' ? 'cross_site' : 'mismatch' };
}

/**
 * Same-origin enforcement for state-changing requests (CSRF defence in depth
 * alongside SameSite cookies — this app has no cookies, but the rule stands).
 * Fails closed when Origin is absent.
 *
 * @param request Incoming request; only unsafe methods are checked.
 * @returns Whether the request may proceed, and why not when it may not.
 */
export function checkOrigin(request: Request): OriginCheck {
  if (isSafeMethod(request.method)) return { ok: true };

  const crossSite = crossSiteRejection(request);
  if (crossSite) return crossSite;

  const origin = request.headers.get('origin');
  if (!origin) return { ok: false, reason: 'missing_origin' };

  const requestOrigin = absoluteOrigin(origin);
  // "null" (sandboxed frame), "file://", a bare host name or anything odd fails.
  if (!requestOrigin) return { ok: false, reason: 'mismatch' };

  const configured = readEnv('APP_ORIGIN')?.trim();
  return configured
    ? matchesPinnedOrigin(requestOrigin, configured)
    : matchesRequestHost(request, requestOrigin);
}

/**
 * Structured server log. Deliberately takes only scalars that cannot carry a
 * coordinate, a profile field or an upstream error body.
 *
 * @param event Route name, status, duration and an optional short outcome tag.
 */
export function logEvent(event: {
  route: string;
  status: number;
  durationMs: number;
  outcome?: string;
}): void {
  const line = JSON.stringify({
    at: new Date().toISOString(),
    route: event.route,
    status: event.status,
    durationMs: Math.round(event.durationMs),
    ...(event.outcome ? { outcome: event.outcome } : {}),
  });
  console.warn(line);
}
