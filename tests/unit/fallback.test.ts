import { describe, expect, it } from 'vitest';
import { buildFallbackPlan, medicalAlertFor } from '@/lib/fallbackPlan';
import { fallbackReasonLabel } from '@/lib/i18n';
import { planSchema } from '@/lib/schemas';
import type { Language, SeverityBand } from '@/lib/types';
import { PROFILE, SNAPSHOT } from '../fixtures';

const LANGUAGES: Language[] = ['en', 'hi', 'te'];
const SEVERITIES: SeverityBand[] = [
  'good',
  'moderate',
  'sensitive',
  'unhealthy',
  'veryUnhealthy',
  'hazardous',
];

describe('deterministic fallback plan', () => {
  it('labels the plan the browser builds when the user cancels', () => {
    const plan = buildFallbackPlan({
      snapshot: SNAPSHOT,
      profile: PROFILE,
      language: 'en',
      severity: 'moderate',
      naqiBand: 'moderate',
      reason: 'cancelled',
    });

    expect(planSchema.safeParse(plan).success).toBe(true);
    expect(plan.generatedBy).toBe('fallback');
    expect(plan.fallbackReason).toBe('cancelled');
    expect(fallbackReasonLabel('en', 'cancelled')).toBe('You cancelled the AI request');
  });

  for (const language of LANGUAGES) {
    for (const severity of SEVERITIES) {
      it(`produces a schema-valid plan for ${language}/${severity}`, () => {
        const plan = buildFallbackPlan({
          snapshot: SNAPSHOT,
          profile: { ...PROFILE, language },
          language,
          severity,
          naqiBand: severity === 'hazardous' ? 'severe' : 'poor',
          reason: 'llm_disabled',
        });

        const parsed = planSchema.safeParse(plan);
        expect(parsed.success).toBe(true);

        expect(plan.generatedBy).toBe('fallback');
        expect(plan.fallbackReason).toBe('llm_disabled');
        expect(plan.language).toBe(language);
        expect(plan.severity).toBe(severity);
        expect(plan.headline.length).toBeGreaterThan(0);
        expect(plan.whatThisMeans.assumption.length).toBeGreaterThan(0);
        expect(plan.indoorHacks.length).toBeGreaterThanOrEqual(5);
        expect(plan.sustainableAlternatives.length).toBeGreaterThanOrEqual(3);

        for (const item of [...plan.indoorHacks, ...plan.sustainableAlternatives]) {
          expect(item.title.length).toBeGreaterThan(0);
          expect(item.detail.length).toBeGreaterThan(0);
          expect(item.impact.mechanism.length).toBeGreaterThan(0);
          expect(item.impact.estimatedReduction.length).toBeGreaterThan(0);
          expect(item.impact.assumption.length).toBeGreaterThan(0);
          expect(['High', 'Medium', 'Low']).toContain(item.impact.confidence);
        }
      });
    }
  }

  it('writes Hindi and Telugu plans in the right script', () => {
    const hi = buildFallbackPlan({
      snapshot: SNAPSHOT,
      profile: { ...PROFILE, language: 'hi' },
      language: 'hi',
      severity: 'unhealthy',
      naqiBand: 'poor',
    });
    const te = buildFallbackPlan({
      snapshot: SNAPSHOT,
      profile: { ...PROFILE, language: 'te' },
      language: 'te',
      severity: 'unhealthy',
      naqiBand: 'poor',
    });
    expect(/[\u0900-\u097F]/.test(hi.headline)).toBe(true);
    expect(/[\u0C00-\u0C7F]/.test(te.headline)).toBe(true);
  });

  it('adds a purifier sizing recommendation only when the room size is known', () => {
    const withRoom = buildFallbackPlan({
      snapshot: SNAPSHOT,
      profile: { ...PROFILE, roomSizeSqm: 30 },
      language: 'en',
      severity: 'unhealthy',
      naqiBand: 'poor',
    });
    const withoutRoom = buildFallbackPlan({
      snapshot: SNAPSHOT,
      profile: { ...PROFILE, roomSizeSqm: undefined },
      language: 'en',
      severity: 'unhealthy',
      naqiBand: 'poor',
    });
    expect(withRoom.indoorHacks.length).toBe(withoutRoom.indoorHacks.length + 1);
    expect(withRoom.indoorHacks.at(-1)?.detail).toContain('m³/h');
  });

  it('states the cigarette-equivalent assumption and never omits it', () => {
    const plan = buildFallbackPlan({
      snapshot: SNAPSHOT,
      profile: PROFILE,
      language: 'en',
      severity: 'unhealthy',
      naqiBand: 'poor',
    });
    expect(plan.whatThisMeans.cigaretteEquivalent).toMatch(/\d/);
    expect(plan.whatThisMeans.assumption).toMatch(/22/);
  });

  it('handles missing PM2.5 without inventing a number', () => {
    const noPm = {
      ...SNAPSHOT,
      current: { ...SNAPSHOT.current, pm25: null },
    };
    const plan = buildFallbackPlan({
      snapshot: noPm,
      profile: PROFILE,
      language: 'en',
      severity: 'unhealthy',
      naqiBand: 'poor',
    });
    expect(plan.whatThisMeans.cigaretteEquivalent).not.toMatch(/cigarettes a day/);
  });
});

describe('medical safety banner', () => {
  it('is present for severe/hazardous air', () => {
    expect(medicalAlertFor('en', 'hazardous', 'severe', false)).toContain(
      'medical advice',
    );
  });

  it('is present for the symptoms toggle at any band', () => {
    expect(medicalAlertFor('en', 'good', 'good', true)).not.toBeNull();
  });

  it('is absent when neither applies', () => {
    expect(medicalAlertFor('en', 'moderate', 'satisfactory', false)).toBeNull();
  });

  it('is localised', () => {
    expect(medicalAlertFor('hi', 'hazardous', 'severe', false)).toMatch(
      /[\u0900-\u097F]/,
    );
    expect(medicalAlertFor('te', 'hazardous', 'severe', false)).toMatch(
      /[\u0C00-\u0C7F]/,
    );
  });
});

describe('fallback reason labels', () => {
  const reasons = [
    'llm_disabled',
    'no_api_key',
    'timeout',
    'upstream_error',
    'invalid_output',
    'medical_content',
    'lang_mismatch',
    'daily_cap',
    'quota_unavailable',
    'rate_limited',
    'unknown',
  ];

  for (const language of LANGUAGES) {
    it(`labels every reason in ${language}`, () => {
      for (const reason of reasons) {
        const label = fallbackReasonLabel(language, reason);
        expect(label.length).toBeGreaterThan(0);
        expect(label).not.toBe(reason);
      }
    });
  }
});
