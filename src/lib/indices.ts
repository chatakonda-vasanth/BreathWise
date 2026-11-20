import { overallUsAqi, usBand, usBandToSeverity, worseBand } from './aqi';
import { naqiBandToSeverity, naqiFromConcentrations, type NaqiResult } from './naqi';
import type { AirSnapshot, SeverityBand, UsBand } from './types';

/**
 * Pure derivation of the indices shown in the UI. Kept free of network and zod
 * imports so the client bundle can use it for sample mode too.
 */

export interface DerivedIndices {
  usAqi: number;
  usBand: UsBand;
  naqi: NaqiResult;
  severity: SeverityBand;
  /** Difference in US AQI against the value ~24h earlier (null if unknown). */
  changeSinceYesterday: number | null;
}

export function deriveIndices(snapshot: AirSnapshot): DerivedIndices {
  const usAqi = snapshot.current.usAqi ?? overallUsAqi({ pm25: snapshot.current.pm25 });

  const naqi = naqiFromConcentrations({
    pm25: snapshot.current.pm25,
    pm10: snapshot.current.pm10,
    no2: snapshot.current.no2,
    o3: snapshot.current.o3,
  });

  const severity = worseBand(
    usBandToSeverity(usBand(usAqi)),
    naqiBandToSeverity(naqi.band),
  );

  const dayAgo = snapshot.history.at(-24) ?? snapshot.history.at(0) ?? null;
  const changeSinceYesterday =
    dayAgo && typeof dayAgo.usAqi === 'number'
      ? Math.round(usAqi - dayAgo.usAqi)
      : null;

  return { usAqi, usBand: usBand(usAqi), naqi, severity, changeSinceYesterday };
}
