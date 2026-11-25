import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError, fetchAir, requestPlan, searchCities } from '@/lib/client';
import { deriveIndices } from '@/lib/indices';
import { PROFILE, SNAPSHOT } from '../fixtures';

/**
 * The browser client is the only place a response is validated on the client.
 * It was previously untested because it "runs in the browser"; the logic is
 * plain fetch handling and is exercised here against a stubbed fetch.
 */

const AIR_BODY = { air: SNAPSHOT, indices: deriveIndices(SNAPSHOT) };

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(typeof body === 'string' ? body : JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('requestJson via fetchAir', () => {
  it('rounds coordinates to 2 decimals and sends same-origin credentials', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(AIR_BODY));
    await fetchAir(19.0761, 72.8771);

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/air?lat=19.08&lon=72.88');
    expect(init.credentials).toBe('same-origin');
    expect((init.headers as Record<string, string>).accept).toBe('application/json');
    // No body → no content-type header.
    expect((init.headers as Record<string, string>)['content-type']).toBeUndefined();
  });

  it('parses a valid response', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(AIR_BODY));
    const response = await fetchAir(19.08, 72.88);
    expect(response.air.lat).toBe(19.08);
  });

  it('rejects a response that does not match the contract', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ air: { lat: 'nope' } }));
    await expect(fetchAir(1, 1)).rejects.toMatchObject({
      status: 502,
      code: 'invalid_response',
    });
  });

  it('rejects an empty 200 body rather than returning null', async () => {
    fetchMock.mockResolvedValueOnce(new Response('', { status: 200 }));
    await expect(fetchAir(1, 1)).rejects.toBeInstanceOf(ApiError);
  });

  it('surfaces the server error code', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ error: 'rate_limited' }, 429));
    await expect(fetchAir(1, 1)).rejects.toMatchObject({
      status: 429,
      code: 'rate_limited',
    });
  });

  it('falls back to server_error when the error body is not JSON', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response('<html>bad gateway</html>', { status: 502 }),
    );
    await expect(fetchAir(1, 1)).rejects.toMatchObject({
      status: 502,
      code: 'server_error',
    });
  });

  it('falls back to server_error for a JSON body without an error field', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ message: 'x' }, 500));
    await expect(fetchAir(1, 1)).rejects.toMatchObject({ code: 'server_error' });
  });

  it('propagates a network failure unchanged', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    await expect(fetchAir(1, 1)).rejects.toBeInstanceOf(TypeError);
  });
});

describe('searchCities', () => {
  it('encodes the query and returns the results array', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        results: [
          {
            id: 1,
            name: 'Delhi',
            country: 'India',
            lat: 28.6,
            lon: 77.2,
            timezone: 'Asia/Kolkata',
          },
        ],
      }),
    );
    const results = await searchCities('New Delhi & <b>');
    const [url] = fetchMock.mock.calls[0] as [string];
    expect(url).toBe(`/api/geocode?q=${encodeURIComponent('New Delhi & <b>')}`);
    expect(results[0]?.name).toBe('Delhi');
  });

  it('rejects a malformed geocode response', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ results: [{ id: 'x' }] }));
    await expect(searchCities('Delhi')).rejects.toMatchObject({ status: 502 });
  });
});

describe('requestPlan', () => {
  it('sends JSON and forwards the abort signal', async () => {
    const controller = new AbortController();
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ plan: { headline: 'x' }, sample: false }),
    );
    try {
      await requestPlan({ profile: PROFILE, lat: 19.08, lon: 72.88 }, controller.signal);
    } catch {
      // The fixture is not a full plan; only the request shape is under test.
    }
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/plan');
    expect(init.method).toBe('POST');
    expect((init.headers as Record<string, string>)['content-type']).toBe(
      'application/json',
    );
    expect(init.signal).toBe(controller.signal);
    expect(JSON.parse(String(init.body))).toMatchObject({ lat: 19.08, lon: 72.88 });
  });
});
