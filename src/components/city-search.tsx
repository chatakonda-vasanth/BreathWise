'use client';

import { useState } from 'react';
import { useGeolocation } from '@/hooks/use-geolocation';
import { searchCities } from '@/lib/shared/client';
import { t } from '@/lib/i18n';
import type { SelectedLocation } from '@/lib/shared/location';
import type { GeocodeResult, Language } from '@/lib/shared/types';
import { CityResults } from './location/city-results';
import { GeoControls } from './location/geo-controls';

;

interface CitySearchProps {
  lang: Language;
  onSelect: (location: SelectedLocation) => void;
}

/** Shortest query worth sending upstream. */
const MIN_QUERY = 2;

/** The query field, with its label and help text. */
function QueryField({
  lang,
  query,
  onQuery,
}: {
  lang: Language;
  query: string;
  onQuery: (value: string) => void;
}) {
  return (
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
        onChange={(event) => onQuery(event.target.value)}
        aria-describedby="city-help"
      />
    </div>
  );
}

/** The query field and its submit button. */
function SearchForm({
  lang,
  query,
  busy,
  onQuery,
  onSubmit,
}: {
  lang: Language;
  query: string;
  busy: boolean;
  onQuery: (value: string) => void;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => Promise<void>;
}) {
  return (
    <>
      <form onSubmit={onSubmit} className="flex flex-col gap-2 sm:flex-row">
        <QueryField lang={lang} query={query} onQuery={onQuery} />
        <button className="btn btn-primary sm:self-end" type="submit" disabled={busy}>
          {busy ? t(lang, 'searching') : t(lang, 'search')}
        </button>
      </form>
      <p className="hint mt-2" id="city-help">
        {t(lang, 'locationHelp')}
      </p>
    </>
  );
}

/** Search state and the single request it makes. */
function useCitySearch(lang: Language) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<GeocodeResult[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSearch(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const trimmed = query.trim();
    if (trimmed.length < MIN_QUERY) return;

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

  return { query, setQuery, results, busy, error, handleSearch };
}

/**
 * City search box with an explicit optional-geolocation path.
 *
 * Nothing typed here reaches the model: the query goes to the geocoder only,
 * and the selected place is reduced to rounded coordinates plus a label.
 */
export function CitySearch({ lang, onSelect }: CitySearchProps) {
  const { query, setQuery, results, busy, error, handleSearch } = useCitySearch(lang);
  const geo = useGeolocation(lang, (fix) =>
    onSelect({ lat: fix.lat, lon: fix.lon, label: t(lang, 'useMyLocation') }),
  );

  return (
    <div className="card">
      <SearchForm
        lang={lang}
        query={query}
        busy={busy}
        onQuery={setQuery}
        onSubmit={handleSearch}
      />
      <GeoControls lang={lang} geo={geo} />
      {error ? (
        <p className="mt-3 text-sm font-semibold" role="status">
          {error}
        </p>
      ) : null}
      {results ? <CityResults results={results} onSelect={onSelect} /> : null}
    </div>
  );
}
