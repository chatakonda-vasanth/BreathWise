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

/**
 * Canonical spelling of a client address, or null when it is not a plausible IP.
 *
 * The rate-limit key is a hash of this string, so two spellings of one address
 * must collapse to one key. IPv6 has many equivalent textual forms
 * (`2001:DB8::1`, `2001:0db8:0:0:0:0:0:1`, `2001:0db8::0001`) and IPv4 allows
 * leading zeros (`010.0.0.1`); hashing the raw header would give one client one
 * bucket per spelling. WHATWG URL serialisation normalises IPv6 for us, and
 * IPv4 is rebuilt from its four numeric octets.
 */
export function canonicalIp(value: string): string | null {
  const candidate = value.trim();
  if (candidate.length === 0 || candidate.length > 45) return null;

  if (IPV4.test(candidate)) {
    const parts = candidate.split('.').map((part) => Number(part));
    if (parts.length !== 4) return null;
    if (parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return null;
    return parts.join('.');
  }

  if (!IPV6.test(candidate) || !candidate.includes(':')) return null;
  try {
    // `hostname` comes back bracketed and normalised, e.g. "[2001:db8::1]".
    const serialised = new URL(`http://[${candidate}]/`).hostname;
    const inner = serialised.startsWith('[') ? serialised.slice(1, -1) : '';
    // Anything the parser rewrote into a dotted quad or another shape is not a
    // form we want to key on.
    return /^[0-9a-f:]+$/.test(inner) ? inner : null;
  } catch {
    return null;
  }
}

/**
 * One address out of a forwarding header, in canonical form.
 *
 * `take` selects which entry is trusted: Vercel-owned headers are read from the
 * **last** entry (a proxy appends, so a value the client prepended can never
 * win), while the development-only `x-forwarded-for` fallback reads the first
 * entry, which is the client in a chain we did not write ourselves.
 */
function ipFromHeader(raw: string | null, take: 'first' | 'last'): string | null {
  if (!raw) return null;
  const entries = raw
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
  if (entries.length === 0) return null;
  const chosen = take === 'last' ? entries[entries.length - 1] : entries[0];
  return chosen ? canonicalIp(chosen) : null;
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
 *
 * The result is always the canonical spelling (see `canonicalIp`), so spelling
 * variants of one address cannot select different buckets.
 */
export function getClientIp(headers: Headers, options: ClientIpOptions = {}): string {
  const trustForwardedFor = options.trustForwardedFor ?? process.env.NODE_ENV !== 'production';

  // Last entry, not first: these are platform-written and a proxy appends, so
  // the entry Vercel vouched for is at the end of the chain.
  for (const name of ['x-vercel-forwarded-for', 'x-real-ip'] as const) {
    const ip = ipFromHeader(headers.get(name), 'last');
    if (ip) return ip;
  }

  if (trustForwardedFor) {
    const ip = ipFromHeader(headers.get('x-forwarded-for'), 'first');
    if (ip) return ip;
  }

  return 'unknown';
}

/** Hash IPs before they become rate-limit keys: no raw addresses are stored. */
export function hashIp(ip: string, salt = 'cleanair'): string {
  return createHash('sha256').update(`${salt}:${ip}`).digest('base64url').slice(0, 32);
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
export function absoluteOrigin(value: string): string | null {
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

  const requestOrigin = absoluteOrigin(origin);
  // "null" (sandboxed frame), "file://", a bare host name or anything odd fails.
  if (!requestOrigin) return { ok: false, reason: 'mismatch' };

  const configured = process.env.APP_ORIGIN?.trim();
  if (configured) {
    // The operator pinned one origin: scheme, host and port must all match. An
    // unparseable value fails closed instead of silently unpinning the check.
    const configuredOrigin = absoluteOrigin(configured);
    if (!configuredOrigin) return { ok: false, reason: 'invalid_config' };
    return requestOrigin === configuredOrigin
      ? { ok: true }
      : { ok: false, reason: 'mismatch' };
  }

  // No APP_ORIGIN: compare against the host the client actually addressed.
  //
  // `Host` is a forbidden header name, so page script cannot forge it, and it
  // is what the browser's `Origin` was derived from. `x-forwarded-host` is only
  // a fallback for a proxy that rewrites Host, and its **last** entry is used: a
  // client can set `X-Forwarded-Host` in a fetch, and a proxy appends the host
  // it really forwarded to, so the last entry is the one that was vouched for.
  const hostHeader = request.headers.get('host')?.trim();
  const forwardedHost = request.headers.get('x-forwarded-host');
  const forwardedEntries = forwardedHost
    ? forwardedHost
        .split(',')
        .map((entry) => entry.trim())
        .filter(Boolean)
    : [];
  const expectedHost = (
    hostHeader && hostHeader.length > 0
      ? hostHeader
      : (forwardedEntries[forwardedEntries.length - 1] ?? '')
  ).toLowerCase();

  if (expectedHost === '') return { ok: false, reason: 'mismatch' };
  return new URL(requestOrigin).host.toLowerCase() === expectedHost
    ? { ok: true }
    : { ok: false, reason: 'mismatch' };
}

export type BodyResult =
  | { ok: true; value: unknown }
  | { ok: false; reason: 'too_large' | 'invalid_json' | 'unsupported_media_type' };

type TextResult =
  | { ok: true; text: string }
  | { ok: false; reason: 'too_large' | 'invalid_json' };

/**
 * Read at most `maxBytes` from the request stream and cancel the rest.
 *
 * Buffering the whole body first (`request.text()`) and checking the length
 * afterwards would let a chunked request with no Content-Length allocate far
 * past the cap before the check ran. The reader stops the moment the cap is
 * crossed, so the bytes past it never reach memory.
 */
async function readBoundedText(request: Request, maxBytes: number): Promise<TextResult> {
  let body: ReadableStream<Uint8Array> | null = null;
  try {
    body = request.body;
  } catch {
    body = null;
  }

  // A runtime without a streaming body still gets the length check, just after
  // buffering.
  if (!body || typeof body.getReader !== 'function') {
    let text: string;
    try {
      text = await request.text();
    } catch {
      return { ok: false, reason: 'invalid_json' };
    }
    if (new TextEncoder().encode(text).byteLength > maxBytes) {
      return { ok: false, reason: 'too_large' };
    }
    return { ok: true, text };
  }

  const reader = body.getReader();
  const decoder = new TextDecoder();
  let received = 0;
  let text = '';

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      received += value.byteLength;
      if (received > maxBytes) {
        await reader.cancel().catch(() => undefined);
        return { ok: false, reason: 'too_large' };
      }
      text += decoder.decode(value, { stream: true });
    }
    text += decoder.decode();
  } catch {
    await reader.cancel().catch(() => undefined);
    return { ok: false, reason: 'invalid_json' };
  }

  return { ok: true, text };
}

/**
 * Bounded JSON body reader. Rejects oversized bodies before parsing, and stops
 * reading (cancelling the stream) as soon as the cap is crossed.
 */
export async function readJsonBody(
  request: Request,
  maxBytes = MAX_BODY_BYTES,
): Promise<BodyResult> {
  // Compare the media type exactly. A substring test accepts nonsense such as
  // `text/plain; x=application/json`; the body must really be JSON.
  const mediaType = (request.headers.get('content-type') ?? '').split(';')[0]?.trim().toLowerCase();
  if (mediaType !== 'application/json') {
    return { ok: false, reason: 'unsupported_media_type' };
  }
  const declared = Number(request.headers.get('content-length') ?? '0');
  if (Number.isFinite(declared) && declared > maxBytes) {
    return { ok: false, reason: 'too_large' };
  }

  const read = await readBoundedText(request, maxBytes);
  if (!read.ok) return read;

  try {
    return { ok: true, value: JSON.parse(read.text) as unknown };
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
