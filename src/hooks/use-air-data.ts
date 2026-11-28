'use client';

import { useCallback, useState } from 'react';
import type { AirResponse } from '@/lib/shared/apiSchemas';
import { fetchAir } from '@/lib/shared/client';
import { t } from '@/lib/i18n';
import { deriveIndices } from '@/lib/air/indices';
import { createSampleSnapshot } from '@/lib/air/sampleData';
import type { Language } from '@/lib/shared/types';

/** Labelled sample snapshot, used only when live data is unavailable. */
export function sampleResponse(): AirResponse {
  const air = createSampleSnapshot();
  return { air, indices: deriveIndices(air) };
}

export interface AirState {
  airData: AirResponse | null;
  airLoading: boolean;
  airError: string | null;
  /** Fetch live air data for a place; falls back to the labelled sample. */
  load: (target: { lat: number; lon: number }) => Promise<void>;
  /** Show the labelled sample snapshot instead of live data. */
  useSample: () => void;
}

/**
 * Air data for the selected place.
 *
 * A failed lookup is never silent: it sets `airError` (so the screen shows the
 * "sample data" banner) and puts the labelled sample snapshot on screen, which
 * is better than an empty panel on a smog day.
 *
 * @param lang Reader's language, used for the localised error text.
 */
export function useAirData(lang: Language): AirState {
  const [airData, setAirData] = useState<AirResponse | null>(null);
  const [airLoading, setAirLoading] = useState(false);
  const [airError, setAirError] = useState<string | null>(null);

  const load = useCallback(
    async (target: { lat: number; lon: number }) => {
      setAirLoading(true);
      setAirError(null);
      setAirData(null);
      try {
        setAirData(await fetchAir(target.lat, target.lon));
      } catch {
        // Live data is unavailable: fall back to clearly labelled sample mode.
        setAirError(t(lang, 'unavailable'));
        setAirData(sampleResponse());
      } finally {
        setAirLoading(false);
      }
    },
    [lang],
  );

  return {
    airData,
    airLoading,
    airError,
    load,
    useSample: () => setAirData(sampleResponse()),
  };
}
