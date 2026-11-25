import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  AIR_CACHE_TTL_MS,
  airCacheSize,
  resetAirCache,
  withAirCache,
} from '@/lib/airCache';
import type { AirSnapshot } from '@/lib/types';
import { SNAPSHOT } from '../fixtures';

/**
 * The air cache exists so neighbours looking at the same city do not each pay
 * for an upstream call. These tests pin the three properties that make it safe:
 * identical coordinates reuse one result, concurrent callers share one fetch,
 * and a failure is never cached.
 */

const load = () => Promise.resolve(SNAPSHOT as AirSnapshot);

afterEach(() => {
  resetAirCache();
  vi.useRealTimers();
});

describe('withAirCache', () => {
  it('serves the second request for the same coordinates from cache', async () => {
    const fetchSnapshot = vi.fn(load);
    await withAirCache(28.65, 77.23, fetchSnapshot);
    const cached = await withAirCache(28.65, 77.23, fetchSnapshot);

    expect(fetchSnapshot).toHaveBeenCalledTimes(1);
    expect(cached.lat).toBe(SNAPSHOT.lat);
    expect(airCacheSize()).toBe(1);
  });

  it('treats coordinates on the same 2-decimal grid as the same key', async () => {
    const fetchSnapshot = vi.fn(load);
    await withAirCache(28.6519, 77.2315, fetchSnapshot);
    await withAirCache(28.65, 77.23, fetchSnapshot);
    expect(fetchSnapshot).toHaveBeenCalledTimes(1);
  });

  it('fetches again for a different city', async () => {
    const fetchSnapshot = vi.fn(load);
    await withAirCache(28.65, 77.23, fetchSnapshot);
    await withAirCache(19.08, 72.88, fetchSnapshot);
    expect(fetchSnapshot).toHaveBeenCalledTimes(2);
  });

  it('dedupes concurrent requests into one upstream call', async () => {
    const fetchSnapshot = vi.fn(load);
    await Promise.all([
      withAirCache(28.65, 77.23, fetchSnapshot),
      withAirCache(28.65, 77.23, fetchSnapshot),
      withAirCache(28.65, 77.23, fetchSnapshot),
    ]);
    expect(fetchSnapshot).toHaveBeenCalledTimes(1);
  });

  it('refetches once the entry has expired', async () => {
    vi.useFakeTimers();
    const fetchSnapshot = vi.fn(load);
    await withAirCache(28.65, 77.23, fetchSnapshot);

    vi.advanceTimersByTime(AIR_CACHE_TTL_MS + 1);
    await withAirCache(28.65, 77.23, fetchSnapshot);
    expect(fetchSnapshot).toHaveBeenCalledTimes(2);
  });

  it('never caches a rejected fetch', async () => {
    const failing = vi.fn(() => Promise.reject(new Error('upstream_unavailable')));
    await expect(withAirCache(28.65, 77.23, failing)).rejects.toThrow(
      'upstream_unavailable',
    );
    expect(airCacheSize()).toBe(0);

    const fetchSnapshot = vi.fn(load);
    await withAirCache(28.65, 77.23, fetchSnapshot);
    expect(fetchSnapshot).toHaveBeenCalledTimes(1);
  });

  it('stays bounded when many distinct coordinates arrive', async () => {
    const fetchSnapshot = vi.fn(load);
    for (let index = 0; index < 250; index += 1) {
      await withAirCache(index / 10, 77.23, fetchSnapshot);
    }
    expect(airCacheSize()).toBeLessThanOrEqual(200);
  });
});
