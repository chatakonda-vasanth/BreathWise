
/**
 * Lifestyle tailoring and the deterministic "with vs without" estimate.
 *
 * Every factor below is a conservative, published-rule-of-thumb style
 * approximation, not a measurement. Each step carries its assumption, and the
 * UI prints the words "rough estimate" next to every number that comes out of
 * this module (in all three languages).
 *
 * The model is multiplicative and capped at zero, so it can never claim a
 * reduction larger than the pollution present, and it never invents a negative
 * concentration.
 */

export type ImpactStepId = 'purifier' | 'sealGaps' | 'ventilationTiming' | 'mask';

export interface ImpactStep {
  id: ImpactStepId;
  /** Percentage reduction applied by this step. */
  reductionPct: number;
  /** `room` lowers indoor PM2.5; `outdoors` lowers personal exposure. */
  appliesTo: 'room' | 'outdoors';
  label: string;
  assumption: string;
}

export interface ImpactComparison {
  /** Outdoor PM2.5 used as the starting point, rounded to 1 decimal. */
  baseline: number;
  /** Modelled indoor PM2.5 after the room steps, rounded to 1 decimal. */
  withChanges: number;
  /** Modelled personal outdoor exposure with a well-fitted mask. */
  outdoorWithMask: number;
  steps: ImpactStep[];
  labels: ImpactLabels;
}

export interface ImpactLabels {
  title: string;
  without: string;
  with: string;
  outdoors: string;
  roughEstimate: string;
  note: string;
  assumptions: string;
  unit: string;
}

