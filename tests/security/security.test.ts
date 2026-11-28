import { describe, expect, it } from 'vitest';
import { buildCsp, createNonce, securityHeaders } from '@/lib/security/security';

describe('content security policy', () => {
  const prod = buildCsp('NONCE123', false);

  it('binds scripts to the per-request nonce', () => {
    expect(prod).toContain(`script-src 'self' 'nonce-NONCE123' 'strict-dynamic'`);
  });

  it('never allows unsafe-inline or unsafe-eval in production', () => {
    expect(prod).not.toContain('unsafe-inline');
    expect(prod).not.toContain('unsafe-eval');
  });

  it('blocks framing, objects, foreign connections and form posts', () => {
    expect(prod).toContain("frame-ancestors 'none'");
    expect(prod).toContain("frame-src 'none'");
    expect(prod).toContain("object-src 'none'");
    expect(prod).toContain("base-uri 'self'");
    expect(prod).toContain("form-action 'self'");
    expect(prod).toContain("connect-src 'self'");
    expect(prod).toContain("font-src 'self'");
    expect(prod).toContain("worker-src 'self'");
    expect(prod).toContain("default-src 'self'");
  });

  it('allows the dev-only escape hatches required by React fast refresh', () => {
    const dev = buildCsp('NONCE123', true);
    expect(dev).toContain("'unsafe-eval'");
    expect(dev).toContain("style-src 'self' 'unsafe-inline'");
  });

  it('produces a different nonce for every request', () => {
    const a = createNonce();
    const b = createNonce();
    expect(a).not.toBe(b);
    expect(a.length).toBeGreaterThanOrEqual(20);
    expect(a).toMatch(/^[A-Za-z0-9+/=]+$/);
  });
});

describe('security headers', () => {
  it('sets the mandatory hardening headers', () => {
    const headers = securityHeaders(true);
    expect(headers['X-Content-Type-Options']).toBe('nosniff');
    expect(headers['Referrer-Policy']).toBe('no-referrer');
    expect(headers['X-Frame-Options']).toBe('DENY');
    expect(headers['Cross-Origin-Opener-Policy']).toBe('same-origin');
    expect(headers['Cross-Origin-Resource-Policy']).toBe('same-origin');
    expect(headers['Strict-Transport-Security']).toContain('max-age=63072000');
  });

  it('permits only same-origin geolocation and disables everything else', () => {
    const policy = securityHeaders(true)['Permissions-Policy'] ?? '';
    expect(policy).toContain('geolocation=(self)');
    expect(policy).toContain('camera=()');
    expect(policy).toContain('microphone=()');
    expect(policy).toContain('payment=()');
    expect(policy).toContain('usb=()');
    // Retired/unknown tokens make Chrome log an error, so they must not appear.
    expect(policy).not.toContain('interest-cohort');
  });

  it('omits HSTS outside production so localhost is not pinned', () => {
    expect(securityHeaders(false)['Strict-Transport-Security']).toBeUndefined();
  });
});
