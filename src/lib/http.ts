import { createHash } from 'node:crypto';
import { MAX_BODY_BYTES } from './constants';

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
  service_unavailable: 'The service is temporarily unavailable. Please try again shortly.',
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

export function errorResponse(code: ErrorCode, extraHeaders?: HeadersInit): Response {
  const body: { error: ErrorCode; message: string } = {
    error: code,
    message: ERROR_MESSAGES[code],
  };
  const headers = new Headers(extraHeaders);
  headers.set('Content-Type', 'application/json; charset=utf-8');
  headers.set('Cache-Control', 'no-store');
  headers.set('X-Content-Type-Options', 'nosniff');
  return new Response(JSON.stringify(body), { status: ERROR_STATUS[code], headers });
}

export function jsonResponse(body: unknown, status = 200, extraHeaders?: HeadersInit): Response {
  const headers = new Headers(extraHeaders);
  headers.set('Content-Type', 'application/json; charset=utf-8');
  headers.set('Cache-Control', 'no-store');
  headers.set('X-Content-Type-Options', 'nosniff');
  return new Response(JSON.stringify(body), { status, headers });
}

const IPV4 = /^(?:\d{1,3}\.){3}\d{1,3}$/;
const IPV6 = /^[0-9a-fA-F:]{2,45}$/;

function isPlausibleIp(value: string): boolean {
  if (IPV4.test(value)) {
    return value.split('.').every((part) => Number(part) >= 0 && Number(part) <= 255);
  }
  return IPV6.test(value) && value.includes(':');
}

export interface ClientIpOptions {
  /**
   * Allow the `x-forwarded-for` last resort. Defaults to on outside production.
   * In production only headers Vercel itself sets are accepted.
   */
  trustForwardedFor?: boolean;
}

/**
 * Client IP for rate limiting.
 *
 * Per Vercel's request-header docs (vercel.com/docs/headers/request-headers,
 * read November 2026), Vercel **overwrites** `x-forwarded-for` at the edge from
 * the TCP connection, and `x-vercel-forwarded-for` / `x-real-ip` are identical
 * values that a proxy in front of Vercel cannot rewrite. When Vercel is the
 * outermost edge — the default — the leftmost entry is the real client.
 *
 * In production we therefore read only `x-vercel-forwarded-for` and `x-real-ip`.
 * A client-supplied `x-forwarded-for` is ignored there, so rotating it cannot
 * pick a new rate-limit bucket. Outside production (local dev, tests, a
 * self-hosted run behind a trusted proxy) `x-forwarded-for` is accepted as a
 * last resort; an unparseable or absent address becomes one shared `unknown`
 * bucket, which is stricter than a bypass.
 */
export function getClientIp(headers: Headers, options: ClientIpOptions = {}): string {
  const trustForwardedFor = options.trustForwardedFor ?? process.env.NODE_ENV !== 'production';

  const candidates = [headers.get('x-vercel-forwarded-for'), headers.get('x-real-ip')];
  if (trustForwardedFor) candidates.push(headers.get('x-forwarded-for'));

  for (const raw of candidates) {
    const candidate = raw?.split(',')[0]?.trim() ?? '';
    if (isPlausibleIp(candidate)) return candidate;
  }

  return 'unknown';
}

/** Hash IPs before they become rate-limit keys: no raw addresses are stored. */
export function hashIp(ip: string, salt = 'cleanair'): string {
  return createHash('sha256').update(`${salt}:${ip}`).digest('base64url').slice(0, 32);
}

export interface OriginCheck {
  ok: boolean;
  reason?: 'missing_origin' | 'mismatch' | 'cross_site';
}

/**
 * Same-origin enforcement for state-changing requests (CSRF defence in depth
 * alongside SameSite cookies — this app has no cookies, but the rule stands).
 * Fails closed when Origin is absent.
 */
export function checkOrigin(request: Request): OriginCheck {
  const method = request.method.toUpperCase();
  if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') return { ok: true };

  const fetchSite = request.headers.get('sec-fetch-site');
  if (fetchSite && fetchSite !== 'same-origin' && fetchSite !== 'none') {
    return { ok: false, reason: fetchSite === 'cross-site' ? 'cross_site' : 'mismatch' };
  }

  const origin = request.headers.get('origin');
  if (!origin) return { ok: false, reason: 'missing_origin' };

  let originHost: string;
  try {
    originHost = new URL(origin).host.toLowerCase();
  } catch {
    return { ok: false, reason: 'mismatch' };
  }

  const configured = process.env.APP_ORIGIN?.trim();
  if (configured) {
    try {
      if (new URL(configured).host.toLowerCase() === originHost) return { ok: true };
    } catch {
      /* fall through to host comparison */
    }
  }

  const hostHeader =
    request.headers.get('x-forwarded-host') ?? request.headers.get('host') ?? '';
  const expectedHost = hostHeader.split(',')[0]?.trim().toLowerCase() ?? '';
  if (expectedHost === '' || originHost !== expectedHost) {
    return { ok: false, reason: 'mismatch' };
  }
  return { ok: true };
}

export type BodyResult =
  | { ok: true; value: unknown }
  | { ok: false; reason: 'too_large' | 'invalid_json' | 'unsupported_media_type' };

/** Bounded JSON body reader. Rejects oversized bodies before parsing. */
export async function readJsonBody(
  request: Request,
  maxBytes = MAX_BODY_BYTES,
): Promise<BodyResult> {
  const contentType = request.headers.get('content-type') ?? '';
  if (!contentType.toLowerCase().includes('application/json')) {
    return { ok: false, reason: 'unsupported_media_type' };
  }
  const declared = Number(request.headers.get('content-length') ?? '0');
  if (Number.isFinite(declared) && declared > maxBytes) {
    return { ok: false, reason: 'too_large' };
  }
  let text: string;
  try {
    text = await request.text();
  } catch {
    return { ok: false, reason: 'invalid_json' };
  }
  if (new TextEncoder().encode(text).byteLength > maxBytes) {
    return { ok: false, reason: 'too_large' };
  }
  try {
    return { ok: true, value: JSON.parse(text) as unknown };
  } catch {
    return { ok: false, reason: 'invalid_json' };
  }
}

/**
 * Structured server log. Deliberately takes only scalars that cannot carry a
 * coordinate, a profile field or an upstream error body.
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
