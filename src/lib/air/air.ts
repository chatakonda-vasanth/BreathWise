import { z } from 'zod';
import {
  AIR_CACHE_TTL_MS,
  AIR_QUALITY_HOST,
  AIR_SOURCE_LABEL,
  GEOCODING_HOST,
  MAX_CITY_QUERY,
  UPSTREAM_TIMEOUT_MS,
} from '@/lib/shared/constants';
import { overallUsAqi } from './aqi';
import { coordCacheKey, isValidLatitude, isValidLongitude, normaliseCoords } from './geo';
import { sanitizeText } from '@/lib/security/sanitize';
import type { AirPoint, AirSnapshot, GeocodeResult } from '@/lib/shared/types';

export { deriveIndices, type DerivedIndices } from './indices';

/**
 * Outbound Open-Meteo access.
 *
 * SSRF protection: the hosts are hard-coded constants and the only variable
 * parts of the URL are numbers we validated and rounded. No user string ever
 * becomes part of an outbound URL.
 */

const nullableNumber = z.number().nullable().optional();

const hourlySchema = z.object({
  time: z.array(z.string()).max(500),
  pm2_5: z.array(nullableNumber).max(500),
  pm10: z.array(nullableNumber).max(500),
  nitrogen_dioxide: z.array(nullableNumber).max(500),
  ozone: z.array(nullableNumber).max(500),
  us_aqi: z.array(nullableNumber).max(500),
});

const currentSchema = z.object({
  time: z.string().min(10).max(40),
  pm2_5: nullableNumber,
  pm10: nullableNumber,
  nitrogen_dioxide: nullableNumber,
  ozone: nullableNumber,
  us_aqi: nullableNumber,
});

const airResponseSchema = z.object({
  timezone: z.string().min(1).max(60),
  current: currentSchema.optional(),
  hourly: hourlySchema,
});

const geocodeResponseSchema = z.object({
  results: z
    .array(
      z.object({
        id: z.number(),
        name: z.string().max(120),
        country: z.string().max(80).optional(),
        admin1: z.string().max(120).optional(),
        latitude: z.number(),
        longitude: z.number(),
        timezone: z.string().max(60).optional(),
      }),
    )
    .max(20)
    .optional(),
});

function num(value: number | null | undefined): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

export class UpstreamError extends Error {
  constructor() {
    super('upstream_unavailable');
    this.name = 'UpstreamError';
  }
}

async function fetchJson(url: string): Promise<unknown> {
  let response: Response;
  try {
    response = await fetch(url, {
      method: 'GET',
      headers: { accept: 'application/json' },
      // Never follow a redirect away from the allow-listed host.
      //
      // `redirect: 'error'` is a Node-only extension: workerd (Cloudflare
      // Workers / OpenNext) throws "Invalid redirect value" before the request
      // is made, which turned every live lookup into a 502 in production.
      // 'manual' is portable and keeps the same guarantee — a 3xx response is
      // surfaced instead of followed, and rejected just below.
      redirect: 'manual',
      cache: 'no-store',
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    });
  } catch {
    throw new UpstreamError();
  }
  if (response.status >= 300 && response.status < 400) throw new UpstreamError();
  if (!response.ok) throw new UpstreamError();
  try {
    return (await response.json()) as unknown;
  } catch {
    throw new UpstreamError();
  }
}

/**
 * Upstream air-quality URL for coordinates already
 * rounded to two decimals. Kept separate from the fetch so it is testable.
 */
export function buildAirUrl(lat: number, lon: number): string {
  const url = new URL('/v1/air-quality', AIR_QUALITY_HOST);
  url.searchParams.set('latitude', lat.toFixed(2));
  url.searchParams.set('longitude', lon.toFixed(2));
  url.searchParams.set('current', 'pm2_5,pm10,nitrogen_dioxide,ozone,us_aqi');
  url.searchParams.set('hourly', 'pm2_5,pm10,nitrogen_dioxide,ozone,us_aqi');
  url.searchParams.set('past_days', '1');
  url.searchParams.set('forecast_days', '2');
  url.searchParams.set('timezone', 'auto');
  return url.toString();
}

/**
 * Upstream geocoding URL for an already validated query.
 */
export function buildGeocodeUrl(query: string): string {
  const url = new URL('/v1/search', GEOCODING_HOST);
  url.searchParams.set('name', query);
  url.searchParams.set('count', '6');
  url.searchParams.set('language', 'en');
  url.searchParams.set('format', 'json');
  return url.toString();
}

function toPoint(raw: {
  time: string;
  pm25?: number | null;
  pm10?: number | null;
  no2?: number | null;
  o3?: number | null;
  usAqi?: number | null;
}): AirPoint {
  const pm25 = num(raw.pm25);
  const pm10 = num(raw.pm10);
  const no2 = num(raw.no2);
  const o3 = num(raw.o3);
  const upstream = num(raw.usAqi);
  const usAqi = upstream ?? overallUsAqi({ pm25, pm10, no2, o3 });
  return {
    time: raw.time,
    usAqi,
    pm25,
    pm10,
    no2,
    o3,
  };
}

const airCache = new Map<string, { expires: number; value: AirSnapshot }>();

/** Test-only cache reset. */
export function __clearAirCache(): void {
  airCache.clear();
}

/**
 * Fetch and normalise an air snapshot (current,
 * past 24 h, next 24 h) for rounded coordinates. Throws UpstreamError on any
 * failure — callers decide whether to fall back to sample data.
 */
type AirPayload = z.infer<typeof airResponseSchema>;

/** A cached snapshot for this coordinate key, when it is still fresh. */
function readCache(key: string): AirSnapshot | null {
  const cached = airCache.get(key);
  return cached && cached.expires > Date.now() ? cached.value : null;
}

/** Store a snapshot and drop expired entries once the cache grows large. */
function writeCache(key: string, snapshot: AirSnapshot): void {
  airCache.set(key, { expires: Date.now() + AIR_CACHE_TTL_MS, value: snapshot });
  if (airCache.size <= 500) return;
  const now = Date.now();
  for (const [cacheKey, entry] of airCache) {
    if (entry.expires <= now) airCache.delete(cacheKey);
  }
}

/** Hourly points from the upstream arrays, index-aligned. */
function hourlyPoints(hourly: AirPayload['hourly']): AirPoint[] {
  return hourly.time.map((time, index) =>
    toPoint({
      time,
      pm25: hourly.pm2_5[index],
      pm10: hourly.pm10[index],
      no2: hourly.nitrogen_dioxide[index],
      o3: hourly.ozone[index],
      usAqi: hourly.us_aqi[index],
    }),
  );
}

/** Index of the current hour, or the last complete day when it is absent. */
function currentIndexFor(points: AirPoint[], hourKey: string): number {
  const found = points.findIndex((point) => point.time.slice(0, 13) === hourKey);
  return found >= 0 ? found : Math.max(0, points.length - 25);
}

/** Build the snapshot shape the app consumes from a validated payload. */
function toSnapshot(
  payload: AirPayload,
  rounded: { lat: number; lon: number },
): AirSnapshot {
  const { timezone, hourly, current } = payload;
  const currentTime = current?.time ?? hourly.time[0];
  if (!currentTime) throw new UpstreamError();

  const points = hourlyPoints(hourly);
  const currentIndex = currentIndexFor(points, currentTime.slice(0, 13));
  const fallbackPoint = points[currentIndex];
  const currentPoint = current
    ? toPoint({
        time: current.time,
        pm25: current.pm2_5,
        pm10: current.pm10,
        no2: current.nitrogen_dioxide,
        o3: current.ozone,
        usAqi: current.us_aqi,
      })
    : fallbackPoint;
  if (!currentPoint) throw new UpstreamError();

  return {
    lat: rounded.lat,
    lon: rounded.lon,
    timezone: timezone.replace(/[^A-Za-z0-9/_+\-]/g, '').slice(0, 60) || 'UTC',
    fetchedAt: new Date().toISOString(),
    current: currentPoint,
    history: points.slice(Math.max(0, currentIndex - 24), currentIndex),
    forecast: points.slice(currentIndex, currentIndex + 24),
    source: AIR_SOURCE_LABEL,
    isSample: false,
  };
}

/**
 * Fetch and normalise an air snapshot (current, past 24 h, next 24 h) for
 * rounded coordinates.
 *
 * @param lat Latitude; rounded and validated before any request is made.
 * @param lon Longitude; rounded and validated before any request is made.
 * @throws {UpstreamError} On invalid coordinates or any upstream failure.
 */
export async function getAirSnapshot(lat: number, lon: number): Promise<AirSnapshot> {
  const rounded = normaliseCoords(lat, lon);
  if (!rounded) throw new UpstreamError();

  const key = coordCacheKey(rounded.lat, rounded.lon);
  const cached = readCache(key);
  if (cached) return cached;

  const raw = await fetchJson(buildAirUrl(rounded.lat, rounded.lon));
  const parsed = airResponseSchema.safeParse(raw);
  if (!parsed.success) throw new UpstreamError();

  const snapshot = toSnapshot(parsed.data, rounded);
  writeCache(key, snapshot);
  return snapshot;
}

/**
 * Search places by name. Returns at most 20 results;
 * throws UpstreamError when the upstream is unavailable.
 */
export async function geocodeCity(query: string): Promise<GeocodeResult[]> {
  const cleaned = sanitizeText(query, MAX_CITY_QUERY);
  if (cleaned.length < 2) return [];

  const raw = await fetchJson(buildGeocodeUrl(cleaned));
  const parsed = geocodeResponseSchema.safeParse(raw);
  if (!parsed.success) throw new UpstreamError();

  return (
    (parsed.data.results ?? [])
      // Upstream coordinates are untrusted too: drop anything a broken or hostile
      // geocoder returns outside the valid range instead of handing it to the UI.
      .filter((row) => isValidLatitude(row.latitude) && isValidLongitude(row.longitude))
      .map((row) => ({
        id: row.id,
        // Upstream text is untrusted: strip markup and cap length before it ever
        // reaches the DOM or a response body.
        name: sanitizeText(row.name, 80),
        country: sanitizeText(row.country ?? '', 60),
        ...(row.admin1 ? { admin1: sanitizeText(row.admin1, 80) } : {}),
        lat: row.latitude,
        lon: row.longitude,
        timezone: sanitizeText(row.timezone ?? 'UTC', 60) || 'UTC',
      }))
  );
}
