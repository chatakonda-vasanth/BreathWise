import { NextResponse, type NextRequest } from 'next/server';
import { buildCsp, createNonce, securityHeaders } from '@/lib/security';

/**
 * Next.js 16 replaced `middleware.ts` with `proxy.ts` (same API, new name).
 * This runs on every request and is the only place security headers are set.
 *
 * Nonce-based CSP forces dynamic rendering for every page (see README).
 */
export function proxy(request: NextRequest) {
  const isProduction = process.env.NODE_ENV === 'production';
  const nonce = createNonce();
  const csp = buildCsp(nonce, !isProduction);

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-nonce', nonce);
  // Next.js parses the nonce out of the request CSP header and applies it to
  // the framework, page bundles and its own inline bootstrap scripts.
  requestHeaders.set('Content-Security-Policy', csp);

  const response = NextResponse.next({ request: { headers: requestHeaders } });

  response.headers.set('Content-Security-Policy', csp);
  for (const [name, value] of Object.entries(securityHeaders(isProduction))) {
    response.headers.set(name, value);
  }

  if (request.nextUrl.pathname.startsWith('/api/')) {
    // API responses are never cached by the browser or a shared cache.
    response.headers.set('Cache-Control', 'no-store, max-age=0');
    // APIs are not documents: they never need a CSP, but dropping it avoids
    // confusing tooling while keeping all other headers.
    response.headers.delete('Content-Security-Policy');
    response.headers.set('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'");
  }

  return response;
}

export const config = {
  // Everything except build assets and the icon set (which are immutable).
  matcher: ['/((?!_next/static|_next/image|icons/|favicon.ico).*)'],
};
