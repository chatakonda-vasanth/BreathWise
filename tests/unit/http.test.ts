import { afterEach, describe, expect, it } from 'vitest';
import { checkOrigin, getClientIp, hashIp, readJsonBody } from '@/lib/http';

const savedOrigin = process.env.APP_ORIGIN;

afterEach(() => {
  if (savedOrigin === undefined) delete process.env.APP_ORIGIN;
  else process.env.APP_ORIGIN = savedOrigin;
});

describe('client IP derivation', () => {
  it("prefers Vercel's trusted header over a client-controlled one", () => {
    const headers = new Headers({
      'x-vercel-forwarded-for': '203.0.113.7',
      'x-forwarded-for': '1.1.1.1',
      'x-real-ip': '198.51.100.4',
    });
    expect(getClientIp(headers)).toBe('203.0.113.7');
  });

  it('uses x-real-ip when the Vercel header is absent', () => {
    expect(getClientIp(new Headers({ 'x-real-ip': '198.51.100.4' }))).toBe('198.51.100.4');
  });

  it('uses only the rightmost x-forwarded-for hop (left entries are spoofable)', () => {
    const headers = new Headers({ 'x-forwarded-for': '6.6.6.6, 203.0.113.50' });
    expect(getClientIp(headers)).toBe('203.0.113.50');
  });

  it('ignores malformed values and falls back to a shared bucket', () => {
    expect(getClientIp(new Headers({ 'x-vercel-forwarded-for': 'not-an-ip' }))).toBe('unknown');
    expect(getClientIp(new Headers())).toBe('unknown');
    expect(getClientIp(new Headers({ 'x-forwarded-for': '999.999.999.999' }))).toBe('unknown');
  });

  it('hashes IPs so no raw address becomes a stored key', () => {
    const hash = hashIp('203.0.113.7');
    expect(hash).not.toContain('203.0.113.7');
    expect(hash).toHaveLength(32);
    expect(hashIp('203.0.113.7')).toBe(hash);
    expect(hashIp('203.0.113.8')).not.toBe(hash);
  });
});

describe('same-origin enforcement', () => {
  function post(headers: Record<string, string>) {
    return new Request('https://app.example/api/plan', { method: 'POST', headers });
  }

  it('allows a same-origin POST', () => {
    const result = checkOrigin(
      post({ origin: 'https://app.example', 'x-forwarded-host': 'app.example' }),
    );
    expect(result.ok).toBe(true);
  });

  it('fails closed when Origin is missing', () => {
    const result = checkOrigin(post({ 'x-forwarded-host': 'app.example' }));
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('missing_origin');
  });

  it('rejects a cross-site origin', () => {
    const result = checkOrigin(
      post({ origin: 'https://evil.example', 'x-forwarded-host': 'app.example' }),
    );
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('mismatch');
  });

  it('rejects a cross-site fetch even with a matching Origin header', () => {
    const result = checkOrigin(
      post({
        origin: 'https://app.example',
        'x-forwarded-host': 'app.example',
        'sec-fetch-site': 'cross-site',
      }),
    );
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('cross_site');
  });

  it('honours APP_ORIGIN when configured', () => {
    process.env.APP_ORIGIN = 'https://cleanair.example';
    const result = checkOrigin(post({ origin: 'https://cleanair.example' }));
    expect(result.ok).toBe(true);
  });

  it('does not apply to safe methods', () => {
    const result = checkOrigin(new Request('https://app.example/api/air?lat=1&lon=2'));
    expect(result.ok).toBe(true);
  });
});

describe('bounded JSON body reader', () => {
  it('rejects non-JSON content types', async () => {
    const request = new Request('https://app.example/api/plan', {
      method: 'POST',
      headers: { 'content-type': 'text/plain' },
      body: 'hello',
    });
    expect(await readJsonBody(request)).toEqual({
      ok: false,
      reason: 'unsupported_media_type',
    });
  });

  it('rejects a declared oversized body before reading it', async () => {
    const request = new Request('https://app.example/api/plan', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'content-length': '999999' },
      body: '{}',
    });
    expect(await readJsonBody(request)).toEqual({ ok: false, reason: 'too_large' });
  });

  it('rejects an actually oversized body', async () => {
    const request = new Request('https://app.example/api/plan', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ junk: 'x'.repeat(9000) }),
    });
    expect(await readJsonBody(request, 8192)).toEqual({ ok: false, reason: 'too_large' });
  });

  it('rejects malformed JSON', async () => {
    const request = new Request('https://app.example/api/plan', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{not json',
    });
    expect(await readJsonBody(request)).toEqual({ ok: false, reason: 'invalid_json' });
  });

  it('accepts a valid small body', async () => {
    const request = new Request('https://app.example/api/plan', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ a: 1 }),
    });
    expect(await readJsonBody(request)).toEqual({ ok: true, value: { a: 1 } });
  });
});
