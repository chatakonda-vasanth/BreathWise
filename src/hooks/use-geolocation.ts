'use client';

import { useState } from 'react';
import { roundCoord } from '@/lib/air/geo';
import { t } from '@/lib/i18n';
import type { Language } from '@/lib/shared/types';

/**
 * Opt-in browser geolocation.
 *
 * The button only asks for consent; the browser prompt appears after the reader
 * agrees. Coordinates are rounded here as well as on the server, so the exact
 * fix never leaves the browser.
 */

type GeoState = 'idle' | 'consent' | 'locating' | 'error';

/** A rounded position; the only shape that ever leaves this hook. */
export interface GeolocationFix {
  lat: number;
  lon: number;
}

export interface Geolocation {
  state: GeoState;
  error: string | null;
  /** Show the consent explanation. */
  request: () => void;
  /** Ask the browser for a position after consent. */
  allow: () => void;
  /** Close the consent explanation without asking. */
  dismiss: () => void;
}

/** How long the browser may take before the attempt counts as failed. */
const TIMEOUT_MS = 10000;
/** Accept a cached fix up to five minutes old. */
const MAX_AGE_MS = 300000;

/**
 * @param lang Reader's language, for the error text.
 * @param onFix Called once with rounded coordinates; never with the raw fix.
 */
export function useGeolocation(
  lang: Language,
  onFix: (fix: GeolocationFix) => void,
): Geolocation {
  const [state, setState] = useState<GeoState>('idle');
  const [error, setError] = useState<string | null>(null);

  function request(): void {
    setError(null);
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setState('error');
      setError(t(lang, 'geoFailed'));
      return;
    }
    setState('consent');
  }

  function allow(): void {
    setState('locating');
    navigator.geolocation.getCurrentPosition(
      (position) => {
        onFix({
          lat: roundCoord(position.coords.latitude),
          lon: roundCoord(position.coords.longitude),
        });
        setState('idle');
      },
      (geoError) => {
        setState('error');
        setError(
          geoError.code === geoError.PERMISSION_DENIED
            ? t(lang, 'geoDenied')
            : t(lang, 'geoFailed'),
        );
      },
      { enableHighAccuracy: false, timeout: TIMEOUT_MS, maximumAge: MAX_AGE_MS },
    );
  }

  return { state, error, request, allow, dismiss: () => setState('idle') };
}
