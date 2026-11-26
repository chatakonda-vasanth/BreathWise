import { createHash } from 'node:crypto';

/**
 * Client address handling for rate limiting.
 *
 * Kept apart from the HTTP module so the trust decision (which header, which
 * end of the chain) can be read and reviewed on its own.
 */

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
 *
 * @param value Raw header value.
 * @returns The canonical form, or null when the value is not an IP address.
 */
export function canonicalIp(value: string): string | null {
  const candidate = value.trim();
  if (candidate.length === 0 || candidate.length > 45) return null;

  if (IPV4.test(candidate)) return canonicalIpv4(candidate);
  if (!IPV6.test(candidate) || !candidate.includes(':')) return null;
  return canonicalIpv6(candidate);
}

/** Rebuild an IPv4 address from its four numeric octets, or reject it. */
function canonicalIpv4(candidate: string): string | null {
  const parts = candidate.split('.').map((part) => Number(part));
  if (parts.length !== 4) return null;
  if (parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255))
    return null;
  return parts.join('.');
}

/** Normalise an IPv6 address through the WHATWG URL parser. */
function canonicalIpv6(candidate: string): string | null {
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
 * The result is always the canonical spelling (see {@link canonicalIp}), so
 * spelling variants of one address cannot select different buckets.
 *
 * @param headers Incoming request headers.
 * @param options `trustForwardedFor` overrides the environment default.
 * @returns A canonical IP string, or `'unknown'`.
 */
export function getClientIp(headers: Headers, options: ClientIpOptions = {}): string {
  const trustForwardedFor =
    options.trustForwardedFor ?? process.env.NODE_ENV !== 'production';

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

/**
 * Hash an IP before it becomes a rate-limit key, so no raw address is stored.
 *
 * @param ip Canonical client address.
 * @param salt Deployment-specific pepper; the default is fine for local use.
 */
export function hashIp(ip: string, salt = 'cleanair'): string {
  return createHash('sha256').update(`${salt}:${ip}`).digest('base64url').slice(0, 32);
}
