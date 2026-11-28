import { describe, expect, it } from 'vitest';
import { buildFallbackPlan } from '@/lib/ai/fallbackPlan';
import { t } from '@/lib/i18n';
import { confidenceLabel, planToText, whatsappShareHref } from '@/lib/ai/planText';
import type { Language } from '@/lib/shared/types';
import { PROFILE, SNAPSHOT } from '../fixtures';

function planFor(language: Language, severity: 'unhealthy' | 'hazardous' = 'unhealthy') {
  return buildFallbackPlan({
    snapshot: SNAPSHOT,
    profile: { ...PROFILE, language },
    language,
    severity,
    naqiBand: severity === 'hazardous' ? 'severe' : 'poor',
    reason: 'no_api_key',
  });
}

describe('plain-text plan', () => {
  it('carries every section a reader sees on screen', () => {
    const text = planToText(planFor('en'), 'en');
    expect(text).toContain(t('en', 'appName'));
    expect(text).toContain(t('en', 'whatThisMeans'));
    expect(text).toContain(t('en', 'bestTime'));
    expect(text).toContain(t('en', 'mask'));
    expect(text).toContain(t('en', 'school'));
    expect(text).toContain(t('en', 'exercise'));
    expect(text).toContain(`== ${t('en', 'indoor')} ==`);
    expect(text).toContain(`== ${t('en', 'sustainable')} ==`);
    expect(text).toContain(t('en', 'communityTitle'));
    expect(text).toContain('[ ]');
    expect(text).toContain(t('en', 'footerMedical'));
  });

  it('prints the impact of every recommendation, with its assumption and confidence', () => {
    const text = planToText(planFor('en'), 'en');
    expect(text).toContain(t('en', 'mechanism'));
    expect(text).toContain(t('en', 'reduction'));
    expect(text).toContain(t('en', 'assumption'));
    expect(text).toContain(`${t('en', 'confidence')}: ${t('en', 'confidenceHigh')}`);
  });

  it('prints a medical alert when the band needs one', () => {
    const text = planToText(planFor('en', 'hazardous'), 'en');
    expect(text).toContain(t('en', 'medicalAlertTitle'));
  });

  it('writes the same structure in Hindi and Telugu', () => {
    const hi = planToText(planFor('hi'), 'hi');
    const te = planToText(planFor('te'), 'te');
    expect(hi).toMatch(/[\u0900-\u097F]/);
    expect(te).toMatch(/[\u0C00-\u0C7F]/);
    expect(hi).toContain(`== ${t('hi', 'indoor')} ==`);
    expect(te).toContain(`== ${t('te', 'indoor')} ==`);
    expect(hi.length).toBeGreaterThan(500);
    expect(te.length).toBeGreaterThan(500);
  });

  it('never emits HTML tags, so a copy cannot carry markup', () => {
    for (const lang of ['en', 'hi', 'te'] as const) {
      const text = planToText(planFor(lang), lang);
      expect(text).not.toMatch(/<[a-z/][^>]*>/i);
    }
  });
});

describe('confidence label', () => {
  it('maps the three documented levels in every language', () => {
    expect(confidenceLabel('High', 'en')).toBe('High');
    expect(confidenceLabel('Medium', 'en')).toBe('Medium');
    expect(confidenceLabel('Low', 'en')).toBe('Low');
    // The Hindi and Telugu packs keep the level names in Latin letters.
    expect(confidenceLabel('High', 'hi')).toBe(t('hi', 'confidenceHigh'));
    expect(confidenceLabel('High', 'te')).toBe(t('te', 'confidenceHigh'));
  });

  it('treats an unknown level as the most cautious one', () => {
    expect(confidenceLabel('unknown', 'en')).toBe(confidenceLabel('Low', 'en'));
  });
});

describe('WhatsApp share link', () => {
  it('encodes the text as a query parameter', () => {
    const href = whatsappShareHref('Air & smoke, 50% better?');
    expect(href.startsWith('https://wa.me/?text=')).toBe(true);
    expect(href).not.toContain(' ');
    expect(href).not.toContain('&');
    const payload = decodeURIComponent(href.split('text=')[1] ?? '');
    expect(payload).toBe('Air & smoke, 50% better?');
  });

  it('truncates very long plans to what the link accepts', () => {
    const href = whatsappShareHref('x'.repeat(5000));
    const payload = decodeURIComponent(href.split('text=')[1] ?? '');
    expect(payload).toHaveLength(3500);
  });
});
