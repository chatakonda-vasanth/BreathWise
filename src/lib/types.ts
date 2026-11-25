/** Shared domain types. No free-text fields exist anywhere in the profile. */

export type Language = 'en' | 'hi' | 'te';

/** US EPA AQI bands. */
export type UsBand =
  'good' | 'moderate' | 'usg' | 'unhealthy' | 'veryUnhealthy' | 'hazardous';

/** Indian CPCB National Air Quality Index bands. */
export type NaqiBand =
  'good' | 'satisfactory' | 'moderate' | 'poor' | 'veryPoor' | 'severe';

/** Unified band used by the UI and the deterministic planner. */
export type SeverityBand =
  'good' | 'moderate' | 'sensitive' | 'unhealthy' | 'veryUnhealthy' | 'hazardous';

export interface AirPoint {
  /** ISO timestamp from upstream, local to the requested location. */
  time: string;
  usAqi: number | null;
  pm25: number | null;
  pm10: number | null;
  no2: number | null;
  o3: number | null;
}

export interface AirSnapshot {
  /** Rounded to 2 decimals before the upstream call. */
  lat: number;
  lon: number;
  timezone: string;
  /** Server time this snapshot was assembled. */
  fetchedAt: string;
  current: AirPoint;
  /** Up to 24 hourly points before `current`. */
  history: AirPoint[];
  /** Up to 24 hourly points after `current`. */
  forecast: AirPoint[];
  /** Always the same literal — the UI credits it next to the timestamp. */
  source: string;
  /** True only for the explicitly toggled / unavailable-upstream demo data. */
  isSample: boolean;
}

export interface GeocodeResult {
  id: number;
  name: string;
  country: string;
  admin1?: string;
  lat: number;
  lon: number;
  timezone: string;
}

export interface ImpactBlock {
  mechanism: string;
  estimatedReduction: string;
  assumption: string;
  confidence: 'High' | 'Medium' | 'Low';
}

export interface Recommendation {
  title: string;
  detail: string;
  impact: ImpactBlock;
}

export interface Plan {
  language: Language;
  severity: SeverityBand;
  headline: string;
  whatThisMeans: {
    text: string;
    cigaretteEquivalent: string;
    assumption: string;
  };
  bestTimeToGoOut: string;
  maskGuidance: string;
  schoolAndCommute: string;
  exerciseTiming: string;
  indoorHacks: Recommendation[];
  sustainableAlternatives: Recommendation[];
  medicalAlert: string | null;
  /** Provenance, so the UI can label a fallback plan honestly. */
  generatedBy: 'llm' | 'fallback';
  fallbackReason?: string;
}
