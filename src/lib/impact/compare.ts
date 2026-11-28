import type { Profile } from '@/lib/shared/schemas';
import type { Language } from '@/lib/shared/types';
import { LABELS, STEP_COPY } from './labels';
import type { ImpactComparison, ImpactStep } from './types';

export const IMPACT_FACTORS = {
  hepa: 40,
  diyBox: 25,
  sealSingle: 10,
  sealDouble: 5,
  sealUnknown: 5,
  sealSealed: 0,
  ventilationTiming: 5,
  wellFittedMask: 80,
} as const;

export const DEFAULTS = {
  homeType: 'apartment',
  windows: 'single',
  kitchenVentilation: 'unknown',
  commuteMode: 'bus',
  budget: 'low',
  roomSizeSqm: 20,
} as const;

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

/**
 * Deterministic with/without comparison.
 *
 * `null` when PM2.5 is unavailable: the app must not show an impact number it
 * cannot ground in data.
 */
type StepCopy = (typeof STEP_COPY)[Language];

/** Reduction for the room-air step, chosen by what the household can spend. */
function purifierPct(budget: NonNullable<Profile['budget']>): number {
  return budget === 'low' ? IMPACT_FACTORS.diyBox : IMPACT_FACTORS.hepa;
}

/** Sealing benefit depends on the glazing already fitted. */
function sealPct(windows: NonNullable<Profile['windows']>): number {
  if (windows === 'single') return IMPACT_FACTORS.sealSingle;
  if (windows === 'sealed') return IMPACT_FACTORS.sealSealed;
  return IMPACT_FACTORS.sealUnknown;
}

/** The four documented steps, with labels in the reader's language. */
function buildSteps(
  budget: NonNullable<Profile['budget']>,
  windows: NonNullable<Profile['windows']>,
  copy: StepCopy,
): ImpactStep[] {
  return [
    {
      id: 'purifier',
      reductionPct: purifierPct(budget),
      appliesTo: 'room',
      label:
        budget === 'low'
          ? (copy.purifier.diy ?? copy.purifier.label)
          : copy.purifier.label,
      assumption: copy.purifier.assumption,
    },
    {
      id: 'sealGaps',
      reductionPct: sealPct(windows),
      appliesTo: 'room',
      label: copy.sealGaps.label,
      assumption: copy.sealGaps.assumption,
    },
    {
      id: 'ventilationTiming',
      reductionPct: IMPACT_FACTORS.ventilationTiming,
      appliesTo: 'room',
      label: copy.ventilationTiming.label,
      assumption: copy.ventilationTiming.assumption,
    },
    {
      id: 'mask',
      reductionPct: IMPACT_FACTORS.wellFittedMask,
      appliesTo: 'outdoors',
      label: copy.mask.label,
      assumption: copy.mask.assumption,
    },
  ];
}

/** Multiplicative remainder after the indoor steps. */
function roomFactor(steps: ImpactStep[]): number {
  return steps
    .filter((step) => step.appliesTo === 'room')
    .reduce((factor, step) => factor * (1 - step.reductionPct / 100), 1);
}

/**
 * Deterministic with/without comparison.
 *
 * `null` when PM2.5 is unavailable: the app must not show an impact number it
 * cannot ground in data.
 *
 * @param args Outdoor PM2.5, optional household profile and the language.
 * @returns The baseline, both modelled endpoints and the labelled steps.
 */
export function compareWithWithout(args: {
  pm25: number | null | undefined;
  profile?: Partial<Profile> | null;
  language: Language;
}): ImpactComparison | null {
  const { pm25, language } = args;
  if (typeof pm25 !== 'number' || !Number.isFinite(pm25) || pm25 < 0) return null;

  const profile = args.profile ?? {};
  const budget = profile.budget ?? DEFAULTS.budget;
  const windows = profile.windows ?? DEFAULTS.windows;
  const steps = buildSteps(budget, windows, STEP_COPY[language]);

  const mask = steps.find((step) => step.id === 'mask');
  const maskFactor = mask ? 1 - mask.reductionPct / 100 : 1;

  return {
    baseline: round1(pm25),
    withChanges: round1(Math.max(0, pm25 * roomFactor(steps))),
    outdoorWithMask: round1(Math.max(0, pm25 * maskFactor)),
    steps,
    labels: LABELS[language],
  };
}

