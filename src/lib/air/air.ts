import { coordCacheKey, isValidLatitude, isValidLongitude, normaliseCoords } from './geo';
import { sanitizeText } from '@/lib/security/sanitize';
import { AIR_CACHE_TTL_MS, MAX_CITY_QUERY } from '@/lib/shared/constants';
import type { AirSnapshot, GeocodeResult } from '@/lib/shared/types';
import { airResponseSchema, buildAirUrl, buildGeocodeUrl, fetchJson, geocodeResponseSchema, UpstreamError } from './upstream';
import { toSnapshot } from './snapshot';

export { deriveIndices, type DerivedIndices } from './indices';
export { buildAirUrl, buildGeocodeUrl, fetchJson, UpstreamError } from './upstream';

const airCache = new Map<string, { expires: number; value: AirSnapshot }>();

/** Test-only cache reset. */
export function __clearAirCache(): void {
  airCache.clear();
}


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
