import { APP_NAME } from '@/lib/constants';

/**
 * RFC 9116 security contact file.
 *
 * The contact is a clearly marked placeholder: no address is invented, and the
 * operator must replace it before publishing a real deployment. The response is
 * a static string with no personal data, no configuration and no request input
 * echoed back, so it is safe to serve as a plain public document.
 */

// No `dynamic = 'force-static'`: the canonical URL is derived from the request
// origin, so this must render per request rather than at build time.
const CONTACT = 'YOUR_EMAIL';

/**
 * Serve the RFC 9116 contact file for the requesting origin.
 *
 * @param request Used only for the canonical and policy URLs.
 * @returns A plain-text, cacheable response with no request data echoed back.
 */
/**
 * Serve the RFC 9116 contact file for the requesting origin.
 *
 * @param request Used only for the canonical and policy URLs.
 * @returns A plain-text, cacheable response with no request data echoed back.
 */
export function GET(request: Request): Response {
  const origin = new URL(request.url).origin;
  const expires = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString();

  const body = [
    `# ${APP_NAME} security contact`,
    `Contact: mailto:${CONTACT}`,
    `Expires: ${expires}`,
    'Preferred-Languages: en, hi, te',
    `Canonical: ${origin}/.well-known/security.txt`,
    `Policy: ${origin}/SECURITY.md`,
    'Acknowledgments: SECURITY.md',
    '',
  ].join('\n');

  return new Response(body, {
    status: 200,
    headers: {
      'content-type': 'text/plain; charset=utf-8',
      // Public, cacheable, and carries nothing that differs per visitor.
      'cache-control': 'public, max-age=3600',
      'x-content-type-options': 'nosniff',
    },
  });
}
