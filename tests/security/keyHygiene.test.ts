import type { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { POST } from '@/app/api/plan/route';
import { LlmError, callGemini } from '@/lib/gemini';
import { __resetRateLimitState } from '@/lib/rateLimit';
import { PROFILE } from '../fixtures';

/**
 * Key hygiene: the API key may travel only in the `x-goog-api-key` header. It
 * must never appear in a request URL, a log line, an error message or a
 * response body — including when the provider echoes it back in an error.
 */

const SENTINEL = 'AQ.unit-test-sentinel-key-must-not-leak';

let logLines: string[] = [];

function captureConsole(method: 'log' | 'warn' | 'error'): void {
  vi.spyOn(console, method).mockImplementation((...args: unknown[]) => {
    logLines.push(
      args.map((arg) => (typeof arg === 'string' ? arg : JSON.stringify(arg))).join(' '),
    );
  });
}

beforeEach(() => {
  logLines = [];
  for (const method of ['log', 'warn', 'error'] as const) captureConsole(method);

  process.env.GEMINI_API_KEY = SENTINEL;
  process.env.APP_ORIGIN = 'http://127.0.0.1:3000';
  delete process.env.LLM_DISABLED;
  delete process.env.DAILY_LLM_CAP;
  delete process.env.UPSTASH_REDIS_REST_URL;
  delete process.env.UPSTASH_REDIS_REST_TOKEN;
  __resetRateLimitState();
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  __resetRateLimitState();
});

describe('outbound request', () => {
  it('puts the key in the x-goog-api-key header and nowhere in the URL', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: '{}' }] } }] }), {
        status: 200,
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await callGemini({ system: 's', user: 'u', apiKey: SENTINEL });

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).not.toContain(SENTINEL);
    expect(url).not.toContain('key=');
    expect(url).toMatch(/\/v1beta\/models\/[^/]+:generateContent$/);
    expect((init.headers as Record<string, string>)['x-goog-api-key']).toBe(SENTINEL);
    expect(logLines.join('\n')).not.toContain(SENTINEL);
  });
});

describe('failure paths', () => {
  const cases: { name: string; respond: () => Promise<Response> }[] = [
    {
      name: 'a rejected key that the provider echoes back',
      respond: async () =>
        new Response(JSON.stringify({ error: { message: `API key not valid: ${SENTINEL}` } }), {
          status: 403,
        }),
    },
    { name: 'a rate limit', respond: async () => new Response('{}', { status: 429 }) },
    {
      name: 'a non-JSON body',
      respond: async () => new Response('<html>bad gateway</html>', { status: 200 }),
    },
    {
      name: 'a request timeout',
      respond: async () => {
        throw Object.assign(new Error('aborted'), { name: 'TimeoutError' });
      },
    },
    {
      name: 'a transport failure',
      respond: async () => {
        throw new TypeError('fetch failed');
      },
    },
  ];

  for (const { name, respond } of cases) {
    it(`keeps the key out of the error and the logs on ${name}`, async () => {
      vi.stubGlobal('fetch', vi.fn().mockImplementation(respond));

      const error = await callGemini({ system: 's', user: 'u', apiKey: SENTINEL }).catch(
        (caught: unknown) => caught,
      );

      expect(error).toBeInstanceOf(LlmError);
      const message = error instanceof Error ? error.message : '';
      expect(message).not.toContain(SENTINEL);
      expect(message).not.toContain('AQ.');

      const logs = logLines.join('\n');
      expect(logs).not.toContain(SENTINEL);
      expect(logs).not.toContain('AQ.');
    });
  }

  it('does not leak the key through the /api/plan response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ error: { message: `API key not valid: ${SENTINEL}` } }), {
          status: 403,
        }),
      ),
    );

    const request = new Request('http://127.0.0.1:3000/api/plan', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        origin: 'http://127.0.0.1:3000',
        'sec-fetch-site': 'same-origin',
      },
      body: JSON.stringify({ profile: PROFILE, lat: 28.6139, lon: 77.209, sample: true }),
    });

    const response = await POST(request as unknown as NextRequest);
    const text = await response.text();

    expect(response.status).toBe(200);
    expect(text).not.toContain(SENTINEL);
    expect(text).not.toContain('AQ.');
    expect(text).not.toContain('API key');

    const logs = logLines.join('\n');
    expect(logs.length).toBeGreaterThan(0);
    expect(logs).not.toContain(SENTINEL);
    expect(logs).not.toContain('AQ.');
  });
});
