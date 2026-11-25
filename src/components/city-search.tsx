'use client';

import { useState } from 'react';
import { searchCities } from '@/lib/client';
import { roundCoord } from '@/lib/geo';
import { t } from '@/lib/i18n';
import type { GeocodeResult, Language } from '@/lib/types';
import { Banner } from './ui';

export interface SelectedLocation {
  lat: number;
  lon: number;
  label: string;
}

interface CitySearchProps {
  lang: Language;
  onSelect: (location: SelectedLocation) => void;
}

type GeoState = 'idle' | 'consent' | 'locating' | 'error';

/**
 * City search box with debounced
 * lookups and an explicit optional-geolocation path.
 */
export function CitySearch({ lang, onSelect }: CitySearchProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<GeocodeResult[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [geoState, setGeoState] = useState<GeoState>('idle');
  const [geoError, setGeoError] = useState<string | null>(null);

  async function handleSearch(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = query.trim();
    if (trimmed.length < 2) return;

    setBusy(true);
    setError(null);
    setResults(null);
    try {
      const found = await searchCities(trimmed);
      setResults(found);
      if (found.length === 0) setError(t(lang, 'noResults'));
    } catch {
      setError(t(lang, 'searchFailed'));
    } finally {
      setBusy(false);
    }
  }

  function requestGeolocation() {
    setGeoError(null);
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setGeoState('error');
      setGeoError(t(lang, 'geoFailed'));
      return;
    }
    setGeoState('consent');
  }

  function allowGeolocation() {
    setGeoState('locating');
    navigator.geolocation.getCurrentPosition(
      (position) => {
        onSelect({
          // Rounded client-side as well: the exact fix never leaves the browser.
          lat: roundCoord(position.coords.latitude),
          lon: roundCoord(position.coords.longitude),
          label: t(lang, 'useMyLocation'),
        });
        setGeoState('idle');
      },
      (geoError) => {
        setGeoState('error');
        setGeoError(
          geoError.code === geoError.PERMISSION_DENIED
            ? t(lang, 'geoDenied')
            : t(lang, 'geoFailed'),
        );
      },
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 },
    );
  }

  return (
    <div className="card">
      <form onSubmit={handleSearch} className="flex flex-col gap-2 sm:flex-row">
        <div className="flex-1">
          <label className="field-label" htmlFor="city-query">
            {t(lang, 'locationTitle')}
          </label>
          <input
            id="city-query"
            className="input"
            type="search"
            inputMode="search"
            autoComplete="off"
            maxLength={60}
            placeholder={t(lang, 'searchPlaceholder')}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            aria-describedby="city-help"
          />
        </div>
        <button className="btn btn-primary sm:self-end" type="submit" disabled={busy}>
          {busy ? t(lang, 'searching') : t(lang, 'search')}
        </button>
      </form>

      <p className="hint mt-2" id="city-help">
        {t(lang, 'locationHelp')}
      </p>

      <div className="mt-3 no-print">
        <button type="button" className="btn" onClick={requestGeolocation}>
          {t(lang, 'useMyLocation')}
        </button>
      </div>

      {geoState === 'consent' ? (
        <div className="mt-3" role="group" aria-labelledby="geo-consent-title">
          <Banner tone="info" title={t(lang, 'geoTitle')}>
            <p id="geo-consent-title">{t(lang, 'geoBody')}</p>
            <div className="mt-2 flex flex-wrap gap-2">
              <button
                type="button"
                className="btn btn-primary"
                onClick={allowGeolocation}
              >
                {t(lang, 'allow')}
              </button>
              <button type="button" className="btn" onClick={() => setGeoState('idle')}>
                {t(lang, 'deny')}
              </button>
            </div>
          </Banner>
        </div>
      ) : null}

      {geoState === 'locating' ? (
        <p className="hint mt-2" role="status">
          {t(lang, 'locating')}
        </p>
      ) : null}

      {geoError ? (
        <p className="mt-2 text-sm font-semibold" role="status">
          {geoError}
        </p>
      ) : null}

      {error ? (
        <p className="mt-3 text-sm font-semibold" role="status">
          {error}
        </p>
      ) : null}

      {results && results.length > 0 ? (
        <ul className="mt-3 divide-y" role="list">
          {results.map((result) => (
            <li key={`${result.id}-${result.lat}-${result.lon}`} className="py-2">
              <button
                type="button"
                className="btn w-full justify-start text-left"
                onClick={() =>
                  onSelect({
                    lat: roundCoord(result.lat),
                    lon: roundCoord(result.lon),
                    label: [result.name, result.admin1, result.country]
                      .filter(Boolean)
                      .join(', ')
                      .slice(0, 80),
                  })
                }
              >
                <span>
                  <strong>{result.name}</strong>
                  {result.admin1 ? (
                    <span className="opacity-75"> · {result.admin1}</span>
                  ) : null}
                  {result.country ? (
                    <span className="opacity-75"> · {result.country}</span>
                  ) : null}
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
