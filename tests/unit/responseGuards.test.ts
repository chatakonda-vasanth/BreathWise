import { describe, expect, it } from 'vitest';
import { deriveIndices } from '@/lib/indices';
import { isAirResponse, isGeocodeResponse, isPlanResponse } from '@/lib/responseGuards';
import type { Recommendation } from '@/lib/types';
import { SNAPSHOT } from '../fixtures';

/**
 * These guards are the client's only shape check now that zod is server-only.
 * They must accept what the API really returns and reject anything the UI would
 * dereference into a TypeError.
 */

const AIR_BODY = { air: SNAPSHOT, indices: deriveIndices(SNAPSHOT) };

const RECOMMENDATION: Recommendation = {
  title: 'Close windows during peak hours',
  detail: 'Keep street-facing windows shut from 17:00 to 21:00.',
  impact: {
    mechanism: 'Less outdoor particulate enters the room.',
    estimatedReduction: 'Meaningful while traffic peaks',
    assumption: 'Assumes the room is otherwise sealed.',
    confidence: 'Medium',
  },
};

const PLAN_BODY = {
  plan: {
    language: 'en',
    severity: 'unhealthy',
    headline: 'Keep the morning routine indoors today',
    whatThisMeans: {
      text: 'Outdoor air is unhealthy for everyone this morning.',
      cigaretteEquivalent: 'Roughly four cigarettes a day at this level.',
      assumption: 'Short-term exposure, not a medical risk estimate.',
    },
    bestTimeToGoOut: 'Mid-afternoon, if you must.',
    maskGuidance: 'A well-fitted N95 for anyone who has to be outside.',
    schoolAndCommute: 'Prefer the bus over walking beside traffic.',
    exerciseTiming: 'Move the run indoors.',
    indoorHacks: [RECOMMENDATION],
    sustainableAlternatives: [RECOMMENDATION],
    medicalAlert: null,
    generatedBy: 'fallback',
    fallbackReason: 'limiter_unavailable',
  },
  air: {
    lat: 28.65,
    lon: 77.23,
    timezone: 'Asia/Kolkata',
    fetchedAt: '2026-11-25T10:00:00.000Z',
    usAqi: 184,
    naqi: 210,
    pm25: 140,
    severity: 'unhealthy',
    sample: false,
  },
  meta: {
    generatedBy: 'fallback',
    fallbackReason: 'limiter_unavailable',
    cacheable: false,
  },
};

const DELHI = {
  id: 1273294,
  name: 'Delhi',
  country: 'India',
  lat: 28.6519,
  lon: 77.2315,
  timezone: 'Asia/Kolkata',
};

/** Structural mutation without `any`: the guard must reject, not throw. */
function without(source: object, key: string): Record<string, unknown> {
  const copy = JSON.parse(JSON.stringify(source)) as Record<string, unknown>;
  delete copy[key];
  return copy;
}

function withValue(source: object, key: string, value: unknown): Record<string, unknown> {
  const copy = JSON.parse(JSON.stringify(source)) as Record<string, unknown>;
  copy[key] = value;
  return copy;
}

describe('isAirResponse', () => {
  it('accepts a real air body', () => {
    expect(isAirResponse(AIR_BODY)).toBe(true);
  });

  it('rejects non-objects, null and arrays', () => {
    for (const value of [null, undefined, 'body', 42, [], true]) {
      expect(isAirResponse(value)).toBe(false);
    }
  });

  it('rejects a missing air or indices section', () => {
    expect(isAirResponse(without(AIR_BODY, 'air'))).toBe(false);
    expect(isAirResponse(without(AIR_BODY, 'indices'))).toBe(false);
  });

  it('rejects a wrong-typed coordinate', () => {
    const broken = { air: { ...SNAPSHOT, lat: 'nope' }, indices: AIR_BODY.indices };
    expect(isAirResponse(broken)).toBe(false);
  });

  it('rejects a non-numeric pollutant reading', () => {
    const point = { ...SNAPSHOT.current, pm25: 'high' };
    const broken = { air: { ...SNAPSHOT, current: point }, indices: AIR_BODY.indices };
    expect(isAirResponse(broken)).toBe(false);
  });

  it('accepts null pollutant readings', () => {
    const point = { ...SNAPSHOT.current, pm25: null, pm10: null };
    expect(
      isAirResponse({ air: { ...SNAPSHOT, current: point }, indices: AIR_BODY.indices }),
    ).toBe(true);
  });

  it('rejects an unknown severity band', () => {
    const broken = withValue(AIR_BODY.indices, 'severity', 'apocalyptic');
    expect(isAirResponse({ air: SNAPSHOT, indices: broken })).toBe(false);
  });

  it('rejects an unknown dominant pollutant', () => {
    const indices = JSON.parse(JSON.stringify(AIR_BODY.indices)) as Record<
      string,
      unknown
    >;
    const naqi = {
      ...(indices.naqi as Record<string, unknown>),
      dominantPollutant: 'so2',
    };
    expect(isAirResponse({ air: SNAPSHOT, indices: { ...indices, naqi } })).toBe(false);
  });

  it('rejects a non-numeric sub-index', () => {
    const indices = JSON.parse(JSON.stringify(AIR_BODY.indices)) as Record<
      string,
      unknown
    >;
    const naqi = {
      ...(indices.naqi as Record<string, unknown>),
      subIndices: { pm25: 'high' },
    };
    expect(isAirResponse({ air: SNAPSHOT, indices: { ...indices, naqi } })).toBe(false);
  });

  it('requires history and forecast entries to be points', () => {
    expect(
      isAirResponse({
        air: { ...SNAPSHOT, history: [{ time: 'x' }] },
        indices: AIR_BODY.indices,
      }),
    ).toBe(false);
    expect(
      isAirResponse({
        air: { ...SNAPSHOT, forecast: 'none' },
        indices: AIR_BODY.indices,
      }),
    ).toBe(false);
  });
});

describe('isGeocodeResponse', () => {
  it('accepts a real geocode body', () => {
    expect(isGeocodeResponse({ results: [DELHI] })).toBe(true);
  });

  it('accepts an empty result list', () => {
    expect(isGeocodeResponse({ results: [] })).toBe(true);
  });

  it('rejects a result without coordinates', () => {
    expect(isGeocodeResponse({ results: [{ id: 1, name: 'Delhi' }] })).toBe(false);
  });

  it('rejects a string id', () => {
    expect(isGeocodeResponse({ results: [{ ...DELHI, id: 'x' }] })).toBe(false);
  });

  it('rejects a non-string admin1', () => {
    expect(isGeocodeResponse({ results: [{ ...DELHI, admin1: 4 }] })).toBe(false);
  });

  it('accepts an omitted admin1', () => {
    expect(isGeocodeResponse({ results: [DELHI] })).toBe(true);
  });

  it('rejects a missing results array', () => {
    expect(isGeocodeResponse({ places: [] })).toBe(false);
  });
});

describe('isPlanResponse', () => {
  it('accepts a real plan body', () => {
    expect(isPlanResponse(PLAN_BODY)).toBe(true);
  });

  it('rejects non-objects', () => {
    for (const value of [null, undefined, 'plan', 7, []]) {
      expect(isPlanResponse(value)).toBe(false);
    }
  });

  it('rejects a missing plan, air or meta section', () => {
    expect(isPlanResponse(without(PLAN_BODY, 'plan'))).toBe(false);
    expect(isPlanResponse(without(PLAN_BODY, 'air'))).toBe(false);
    expect(isPlanResponse(without(PLAN_BODY, 'meta'))).toBe(false);
  });

  it('rejects an unknown language', () => {
    expect(
      isPlanResponse({ ...PLAN_BODY, plan: { ...PLAN_BODY.plan, language: 'fr' } }),
    ).toBe(false);
  });

  it('rejects an empty headline', () => {
    expect(
      isPlanResponse({ ...PLAN_BODY, plan: { ...PLAN_BODY.plan, headline: '  ' } }),
    ).toBe(false);
  });

  it('rejects a plan whose "what this means" block is incomplete', () => {
    const plan = { ...PLAN_BODY.plan, whatThisMeans: { text: 'Only text.' } };
    expect(isPlanResponse({ ...PLAN_BODY, plan })).toBe(false);
  });

  it('rejects a missing guidance paragraph', () => {
    expect(
      isPlanResponse({ ...PLAN_BODY, plan: without(PLAN_BODY.plan, 'maskGuidance') }),
    ).toBe(false);
  });

  it('rejects a recommendation without an impact block', () => {
    const plan = {
      ...PLAN_BODY.plan,
      indoorHacks: [{ title: 'Close windows', detail: 'At night.' }],
    };
    expect(isPlanResponse({ ...PLAN_BODY, plan })).toBe(false);
  });

  it('rejects an unknown confidence value', () => {
    const rec = {
      ...RECOMMENDATION,
      impact: { ...RECOMMENDATION.impact, confidence: 'Certain' },
    };
    expect(
      isPlanResponse({ ...PLAN_BODY, plan: { ...PLAN_BODY.plan, indoorHacks: [rec] } }),
    ).toBe(false);
  });

  it('accepts a medical alert string and rejects an object', () => {
    expect(
      isPlanResponse({
        ...PLAN_BODY,
        plan: { ...PLAN_BODY.plan, medicalAlert: 'Call a doctor.' },
      }),
    ).toBe(true);
    expect(
      isPlanResponse({
        ...PLAN_BODY,
        plan: { ...PLAN_BODY.plan, medicalAlert: { text: 'x' } },
      }),
    ).toBe(false);
  });

  it('rejects an unknown provenance value', () => {
    expect(
      isPlanResponse({
        ...PLAN_BODY,
        plan: { ...PLAN_BODY.plan, generatedBy: 'mystery' },
      }),
    ).toBe(false);
  });

  it('requires meta.cacheable to be boolean', () => {
    expect(
      isPlanResponse({ ...PLAN_BODY, meta: { ...PLAN_BODY.meta, cacheable: 'no' } }),
    ).toBe(false);
  });

  it('requires the air summary severity and sample flag', () => {
    expect(
      isPlanResponse({ ...PLAN_BODY, air: without(PLAN_BODY.air, 'severity') }),
    ).toBe(false);
    expect(
      isPlanResponse({ ...PLAN_BODY, air: { ...PLAN_BODY.air, sample: 'no' } }),
    ).toBe(false);
  });
});
