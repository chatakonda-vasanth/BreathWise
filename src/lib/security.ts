/** Security header construction, kept pure so it can be unit tested. */

export interface SecurityHeaderMap {
  [name: string]: string;
}

/**
 * Per-request strict CSP.
 *
 * - No `'unsafe-inline'` in production: scripts and styles carry a fresh nonce.
 * - No `'unsafe-eval'` in production (React needs it only for dev overlay).
 * - `'strict-dynamic'` lets the nonce-carrying Next.js bootstrap load its chunks.
 * - `worker-src 'self'` is required for the service worker.
 * - `connect-src 'self'` keeps all fetches same-origin: the browser never talks
 *   to Open-Meteo or Gemini directly (and never sees a key).
 */
export function buildCsp(nonce: string, isDev: boolean): string {
  const directives = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ''}`,
    // Dev: React refresh injects inline styles, so inline is permitted there.
    // Production: styles are nonce-bound, no 'unsafe-inline'.
    isDev ? "style-src 'self' 'unsafe-inline'" : `style-src 'self' 'nonce-${nonce}'`,
    "img-src 'self' data:",
    "font-src 'self'",
    "connect-src 'self'",
    "manifest-src 'self'",
    "worker-src 'self'",
    "media-src 'none'",
    "object-src 'none'",
    "frame-src 'none'",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    'upgrade-insecure-requests',
  ];
  return directives.join('; ');
}

/** Non-CSP security headers. HSTS is only meaningful over HTTPS. */
export function securityHeaders(isProduction: boolean): SecurityHeaderMap {
  const headers: SecurityHeaderMap = {
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy': [
      'geolocation=(self)',
      'camera=()',
      'microphone=()',
      'payment=()',
      'usb=()',
      'magnetometer=()',
      'gyroscope=()',
      'accelerometer=()',
      'interest-cohort=()',
    ].join(', '),
    'Cross-Origin-Opener-Policy': 'same-origin',
    'Cross-Origin-Resource-Policy': 'same-origin',
    'X-DNS-Prefetch-Control': 'off',
  };
  if (isProduction) {
    headers['Strict-Transport-Security'] = 'max-age=63072000; includeSubDomains; preload';
  }
  return headers;
}

/** Fresh, unguessable per-request nonce (16 random bytes, base64). */
export function createNonce(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}
