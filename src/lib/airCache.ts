import type { AirSnapshot } from './types';

/**
 * Short-lived server-side cache for upstream air data.
 *
 * Open-Meteo updates hourly but the app is polled far more often than that;
 * neighbours searching the same city within a few minutes should cost one
 * upstream call, not one each. Two things are cached:
 *
 *  - the *promise*, so ten simultaneous requests for Delhi share one fetch;
 *  - the result, for `TTL_MS`, so a reload a minute later is free.
 *
 * If the fetch rejects, the entry is removed at once: a failed upstream must
 * never be cached, or an outage outlives its cause.
 *
 * Coordinates are already rounded to 2 decimals by the caller, so the key is
 * the same grid the upstream query uses (~1.1 km). Nothing personal is stored:
 * the key is a coordinate pair and the value is public air data.
 */

/** Matches the "10 minutes, server-side" contract documented on /api/air. */
export const AIR_CACHE_TTL_MS = 10 * 60_000;

/** Small bound so a flood of distinct coordinates cannot grow the map. */
const MAX_ENTRIES = 200;

interface Entry {
  expiresAt: number;
  value: Promise<AirSnapshot>;
}

const cache = new Map<string, Entry>();

function key(lat: number, lon: number): string {
  return `${lat.toFixed(2)},${lon.toFixed(2)}`;
}

function evictExpired(now: number): void {
  for (const [entryKey, entry] of cache) {
    if (entry.expiresAt <= now) cache.delete(entryKey);
  }
}

function evictOldest(): void {
  const oldest = cache.keys().next();
  if (!oldest.done) cache.delete(oldest.value);
}

/**
 * Return a cached snapshot for these coordinates, or run `load` and cache it.
 *
 * @param load Fetches a fresh snapshot. Only called on a cache miss.
 */
export async function withAirCache(
  lat: number,
  lon: number,
  load: () => Promise<AirSnapshot>,
): Promise<AirSnapshot> {
  const now = Date.now();
  const cacheKey = key(lat, lon);
  const hit = cache.get(cacheKey);
  if (hit && hit.expiresAt > now) return hit.value;

  evictExpired(now);
  if (cache.size >= MAX_ENTRIES) evictOldest();

  const value = load();
  cache.set(cacheKey, { expiresAt: now + AIR_CACHE_TTL_MS, value });
  try {
    return await value;
  } catch (error) {
    // Never keep a rejected promise: the next request must retry upstream.
    if (cache.get(cacheKey)?.value === value) cache.delete(cacheKey);
    throw error;
  }
}

/** Test helper: drop every cached snapshot. */
export function resetAirCache(): void {
  cache.clear();
}

/** Test helper: how many coordinate slots are currently held. */
export function airCacheSize(): number {
  return cache.size;
}
