import { afterEach, describe, expect, it } from 'vitest';
import { canonicalIp, checkOrigin, getClientIp, hashIp, readJsonBody } from '@/lib/http';

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

  it('reads the leftmost entry, which Vercel guarantees is the real client', () => {
    const headers = new Headers({ 'x-forwarded-for': '203.0.113.50, 6.6.6.6' });
    expect(getClientIp(headers)).toBe('203.0.113.50');
    expect(getClientIp(headers, { trustForwardedFor: false })).toBe('unknown');
  });

  it('ignores a client-supplied x-forwarded-for in production', () => {
    const spoofed = new Headers({ 'x-forwarded-for': '1.2.3.4' });
    expect(getClientIp(spoofed, { trustForwardedFor: false })).toBe('unknown');

    // A trusted Vercel header always wins, so rotating x-forwarded-for cannot
    // select a different rate-limit bucket.
    const both = new Headers({
      'x-vercel-forwarded-for': '203.0.113.7',
      'x-forwarded-for': '1.2.3.4',
    });
    expect(getClientIp(both, { trustForwardedFor: false })).toBe('203.0.113.7');
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

  // Regression: one client must not be able to pick a fresh rate-limit bucket
  // by changing how its own address is spelled.
  it('collapses every textual form of one IPv6 address to a single key', () => {
    const forms = [
      '2001:db8::1',
      '2001:DB8::1',
      '2001:0db8:0:0:0:0:0:1',
      '2001:0db8::0001',
      '2001:db8:0::0:1',
    ];
    const keys = forms.map((form) => getClientIp(new Headers({ 'x-real-ip': form })));
    expect(new Set(keys).size).toBe(1);
    expect(new Set(keys.map((key) => hashIp(key))).size).toBe(1);
  });

  it('collapses leading zeros in an IPv4 address', () => {
    const keys = ['10.0.0.1', '010.0.0.1', '010.000.000.001'].map((form) =>
      getClientIp(new Headers({ 'x-real-ip': form })),
    );
    expect(new Set(keys)).toEqual(new Set(['10.0.0.1']));
  });

  it('takes the last entry of a platform forwarding header', () => {
    // A client can prepend a value; a proxy appends the address it really saw.
    const headers = new Headers({ 'x-vercel-forwarded-for': '1.2.3.4, 203.0.113.9' });
    expect(getClientIp(headers)).toBe('203.0.113.9');
  });

  it('rejects IPv6 spellings the parser cannot normalise', () => {
    expect(canonicalIp('2001:db8:::1')).toBeNull();
    expect(canonicalIp(':::')).toBeNull();
    expect(getClientIp(new Headers({ 'x-real-ip': '2001:db8:1' }))).toBe('unknown');
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

  // Regression: `X-Forwarded-Host` is not a forbidden header, so page script can
  // set it. `Host` is forbidden and is what the browser derived `Origin` from,
  // so it must win; otherwise a forged pair of headers satisfies the check.
  it('ignores a forged X-Forwarded-Host when Host disagrees', () => {
    const result = checkOrigin(
      post({
        origin: 'https://evil.example',
        host: 'app.example',
        'x-forwarded-host': 'evil.example',
      }),
    );
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('mismatch');
  });

  it('uses the last X-Forwarded-Host entry when a proxy appends', () => {
    const result = checkOrigin(
      post({ origin: 'https://app.example', 'x-forwarded-host': 'evil.example, app.example' }),
    );
    expect(result.ok).toBe(true);
  });

  it('requires the configured scheme, host and port to match exactly', () => {
    process.env.APP_ORIGIN = 'https://cleanair.example';
    // Downgrade to plain HTTP on the same host is not the same origin.
    expect(
      checkOrigin(post({ origin: 'http://cleanair.example', host: 'cleanair.example' })).ok,
    ).toBe(false);
    expect(checkOrigin(post({ origin: 'https://cleanair.example:8443' })).ok).toBe(false);
    expect(checkOrigin(post({ origin: 'https://evil-cleanair.example' })).ok).toBe(false);
    expect(checkOrigin(post({ origin: 'https://cleanair.example.evil.example' })).ok).toBe(false);
    expect(checkOrigin(post({ origin: 'https://cleanair.example' })).ok).toBe(true);
  });

  it('accepts a configured origin written with a trailing slash', () => {
    process.env.APP_ORIGIN = 'https://cleanair.example/';
    expect(checkOrigin(post({ origin: 'https://cleanair.example' })).ok).toBe(true);
  });

  // Regression: a typo'd APP_ORIGIN used to be ignored silently, so the pin the
  // operator thought they had configured was not enforced at all.
  it('fails closed when APP_ORIGIN is not an absolute http(s) origin', () => {
    for (const broken of [
      'cleanair.example',
      'cleanair.example:443',
      'ftp://cleanair.example',
      '//cleanair.example',
    ]) {
      process.env.APP_ORIGIN = broken;
      const result = checkOrigin(post({ origin: 'https://app.example', host: 'app.example' }));
      expect(result.ok, `APP_ORIGIN=${JSON.stringify(broken)} must fail closed`).toBe(false);
    }
  });

  it('rejects an opaque or non-http Origin even with no APP_ORIGIN', () => {
    for (const origin of ['null', 'file://', 'app.example', 'data:text/html,x']) {
      expect(checkOrigin(post({ origin, host: 'app.example' })).ok).toBe(false);
    }
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

  it('requires the media type itself to be application/json', async () => {
    const request = new Request('https://app.example/api/plan', {
      method: 'POST',
      headers: { 'content-type': 'text/plain; x=application/json' },
      body: '{}',
    });
    expect(await readJsonBody(request)).toEqual({
      ok: false,
      reason: 'unsupported_media_type',
    });
  });

  // Regression: the cap used to be checked only after `request.text()` had
  // buffered the whole body, so a chunked body with no Content-Length was read
  // to the end before being rejected.
  it('stops reading an oversized chunked body and cancels the stream', async () => {
    let cancelled = false;
    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode('{"junk":"'));
        controller.enqueue(encoder.encode('x'.repeat(20_000)));
        // Deliberately left open: the reader must give up on its own.
      },
      cancel() {
        cancelled = true;
      },
    });

    const request = new Request('https://app.example/api/plan', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: stream,
      duplex: 'half',
    } as RequestInit);

    expect(request.headers.get('content-length')).toBeNull();
    expect(await readJsonBody(request, 8192)).toEqual({ ok: false, reason: 'too_large' });
    expect(cancelled).toBe(true);
  });
});
