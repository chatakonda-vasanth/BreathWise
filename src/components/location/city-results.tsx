'use client';

import { roundCoord } from '@/lib/geo';
import type { SelectedLocation } from '@/lib/location';
import type { GeocodeResult } from '@/lib/types';

/** "City · Region · Country", capped so a long upstream name cannot run on. */
function labelOf(result: GeocodeResult): string {
  return [result.name, result.admin1, result.country]
    .filter(Boolean)
    .join(', ')
    .slice(0, 80);
}

/**
 * The matching places, each a full-width button.
 *
 * Coordinates are rounded again on the way out so the value the app stores is
 * the same one the server would round to.
 */
export function CityResults({
  results,
  onSelect,
}: {
  results: GeocodeResult[];
  onSelect: (location: SelectedLocation) => void;
}) {
  if (results.length === 0) return null;

  return (
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
                label: labelOf(result),
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
  );
}
