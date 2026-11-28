import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  UpstreamError,
  __clearAirCache,
  buildAirUrl,
  buildGeocodeUrl,
  geocodeCity,
  getAirSnapshot,
} from '@/lib/air/air';
import { deriveIndices } from '@/lib/air/indices';
import { SNAPSHOT } from '../fixtures';

function hourlyTimes(): string[] {
  const start = Date.UTC(2026, 0, 14, 0, 0, 0);
  return Array.from(
    { length: 72 },
    (_, index) => `${new Date(start + index * 3_600_000).toISOString().slice(0, 13)}:00`,
  );
}

function payload(): Record<string, unknown> {
  const times = hourlyTimes();
  const fill = (value: number) => times.map(() => value);
  return {
    timezone: 'Asia/Kolkata',
    current: {
      time: '2026-01-15T10:00',
      pm2_5: 80,
      pm10: 150,
      nitrogen_dioxide: 30,
      ozone: 40,
      us_aqi: 165,
    },
    hourly: {
      time: times,
      pm2_5: fill(80),
      pm10: fill(150),
      nitrogen_dioxide: fill(30),
      ozone: fill(40),
      us_aqi: fill(165),
    },
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
  __clearAirCache();
});

describe('upstream URL construction (SSRF guard)', () => {
  it('only ever targets the allow-listed air-quality host', () => {
    const url = new URL(buildAirUrl(19.07609, 72.87766));
    expect(url.origin).toBe('https://air-quality-api.open-meteo.com');
    expect(url.pathname).toBe('/v1/air-quality');
    expect(url.searchParams.get('latitude')).toBe('19.08');
    expect(url.searchParams.get('longitude')).toBe('72.88');
    expect(url.searchParams.get('timezone')).toBe('auto');
  });

  it('only ever targets the allow-listed geocoding host', () => {
    const url = new URL(buildGeocodeUrl('Delhi'));
    expect(url.origin).toBe('https://geocoding-api.open-meteo.com');
    expect(url.pathname).toBe('/v1/search');
  });

  it('cannot be influenced by non-numeric coordinate input', () => {
    const url = buildAirUrl(19.08, 72.88);
    expect(url).not.toContain('&url=');
    expect(url).not.toContain('http%3A');
  });
});

describe('getAirSnapshot', () => {
  it('builds 24h of history and 24h of forecast from validated upstream data', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify(payload()), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      ),
    );

    const snapshot = await getAirSnapshot(19.076, 72.877);
    expect(snapshot.lat).toBe(19.08);
    expect(snapshot.lon).toBe(72.88);
    expect(snapshot.current.usAqi).toBe(165);
    expect(snapshot.history).toHaveLength(24);
    expect(snapshot.forecast).toHaveLength(24);
    expect(snapshot.isSample).toBe(false);
  });

  it('caches repeated lookups for the same rounded coordinates', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(payload()), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await getAirSnapshot(19.0761, 72.8771);
    await getAirSnapshot(19.0762, 72.8772);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('throws a generic UpstreamError on malformed upstream data', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ unexpected: true }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      ),
    );
    await expect(getAirSnapshot(10, 10)).rejects.toBeInstanceOf(UpstreamError);
  });

  it('throws a generic UpstreamError on a non-2xx response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response('nope', { status: 500 })),
    );
    await expect(getAirSnapshot(11, 11)).rejects.toBeInstanceOf(UpstreamError);
  });

  it('throws a generic UpstreamError on a network failure', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ECONNREFUSED')));
    await expect(getAirSnapshot(12, 12)).rejects.toBeInstanceOf(UpstreamError);
  });

  // Regression: workerd (Cloudflare Workers / OpenNext) rejects
  // `redirect: 'error'` with "Invalid redirect value" before the request is
  // made, which made every deployed /api/air and /api/geocode call return 502.
  it('sends only fetch options that workerd accepts', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(payload()), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await getAirSnapshot(13.13, 80.27);
    const init = fetchMock.mock.calls[0]?.[1] as RequestInit | undefined;
    expect(init?.redirect).toBe('manual');
    expect(init?.cache).toBe('no-store');
  });

  it('rejects a redirect instead of following it', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(null, {
          status: 302,
          headers: { location: 'https://169.254.169.254/latest/meta-data/' },
        }),
      ),
    );
    await expect(getAirSnapshot(14.14, 80.27)).rejects.toBeInstanceOf(UpstreamError);
  });

  it('refuses out-of-range coordinates before any fetch', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    await expect(getAirSnapshot(999, 0)).rejects.toBeInstanceOf(UpstreamError);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('geocodeCity', () => {
  it('strips markup from upstream place names', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            results: [
              {
                id: 1,
                name: '<img src=x onerror=alert(1)>Delhi',
                country: 'India',
                latitude: 28.61,
                longitude: 77.2,
                timezone: 'Asia/Kolkata',
              },
            ],
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
      ),
    );
    const results = await geocodeCity('Delhi');
    expect(results[0]?.name).toBe('Delhi');
  });

  it('returns an empty list for too-short queries without calling upstream', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    expect(await geocodeCity('a')).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('deriveIndices', () => {
  it('combines US AQI and NAQI with worst-wins severity', () => {
    const derived = deriveIndices(SNAPSHOT);
    expect(derived.usAqi).toBe(180);
    expect(derived.usBand).toBe('unhealthy');
    expect(derived.naqi.band).toBe('poor');
    expect(derived.severity).toBe('unhealthy');
    expect(typeof derived.changeSinceYesterday).toBe('number');
  });
});
