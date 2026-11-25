import { describe, expect, it } from 'vitest';
import {
  containsMarkup,
  looksLikeMedicalAdvice,
  sanitizePlan,
  sanitizeText,
  scriptMatches,
} from '@/lib/sanitize';
import { buildFallbackPlan } from '@/lib/fallbackPlan';
import { deriveIndices } from '@/lib/indices';
import { PROFILE, SNAPSHOT } from '../fixtures';

describe('sanitizeText', () => {
  it('strips tags, script blocks and markdown links', () => {
    expect(sanitizeText('<script>alert(1)</script>Hello', 200)).toBe('Hello');
    expect(sanitizeText('Read <b>this</b> now', 200)).toBe('Read this now');
    expect(sanitizeText('[click](javascript:alert(1)) here', 200)).toBe('click here');
  });

  it('removes control characters and zero-width characters', () => {
    expect(sanitizeText('a\u0000b\u200Bc', 200)).toBe('abc');
  });

  it('caps length with an ellipsis', () => {
    const result = sanitizeText('a'.repeat(50), 10);
    expect(result.length).toBeLessThanOrEqual(10);
    expect(result.endsWith('…')).toBe(true);
  });

  it('collapses whitespace but keeps paragraphs', () => {
    expect(sanitizeText('a   b\n\n\n\nc', 200)).toBe('a b\n\nc');
  });

  it('detects markup', () => {
    expect(containsMarkup('<img src=x onerror=alert(1)>')).toBe(true);
    expect(containsMarkup('plain text')).toBe(false);
  });
});

describe('medical safety guard', () => {
  it('flags dosages, drugs and diagnosis language', () => {
    expect(looksLikeMedicalAdvice('Take 500 mg paracetamol twice a day')).toBe(true);
    expect(looksLikeMedicalAdvice('Dosage: two tablets daily')).toBe(true);
    expect(looksLikeMedicalAdvice('You have asthma')).toBe(true);
    expect(looksLikeMedicalAdvice('Your diagnosis is COPD')).toBe(true);
    expect(looksLikeMedicalAdvice('Prescribed inhaler for symptoms')).toBe(true);
  });

  it('does not flag ordinary guidance', () => {
    expect(looksLikeMedicalAdvice('Open opposite windows for 10 minutes.')).toBe(false);
    expect(looksLikeMedicalAdvice('Wear a fitted N95 mask outdoors.')).toBe(false);
    expect(looksLikeMedicalAdvice('Seek medical help if breathing worsens.')).toBe(false);
  });

  // Regression: µg/m³ is a concentration, not a dose. Matching it rejected every
  // real plan (which quotes PM2.5) and served the fallback instead.
  it('does not treat pollution concentrations as dosages', () => {
    expect(looksLikeMedicalAdvice('PM2.5 is 111 µg/m³ this afternoon.')).toBe(false);
    expect(looksLikeMedicalAdvice('It settles to 66.8–70.5 µg/m3 tonight.')).toBe(false);
    expect(looksLikeMedicalAdvice('PM2.5 stays near 120 µg per cubic metre.')).toBe(false);
    expect(looksLikeMedicalAdvice('Suspended dust near 30 mg/m³ on the road.')).toBe(false);
    expect(looksLikeMedicalAdvice('Dust can reach 400 mg/m3 during road work.')).toBe(false);
    expect(looksLikeMedicalAdvice('Road dust of 30 mg per cubic metre at the junction.')).toBe(
      false,
    );
  });

  // Regression: ppm and ppb are gas concentrations (NO2, O3, CO), never doses.
  it('does not treat gas concentrations in ppm or ppb as dosages', () => {
    expect(looksLikeMedicalAdvice('NO2 is 45 ppb at the kerb.')).toBe(false);
    expect(looksLikeMedicalAdvice('Ozone peaks at 0.07 ppm in the afternoon.')).toBe(false);
    expect(looksLikeMedicalAdvice('CO stays under 1.2 ppm indoors.')).toBe(false);
    expect(looksLikeMedicalAdvice('The sensor reports 120 ppb and 0.09 ppm.')).toBe(false);
  });

  it('still flags a real dose', () => {
    expect(looksLikeMedicalAdvice('Take 500 mg twice a day')).toBe(true);
    expect(looksLikeMedicalAdvice('500 mg')).toBe(true);
    expect(looksLikeMedicalAdvice('Give 5 ml of syrup')).toBe(true);
    expect(looksLikeMedicalAdvice('2 tablets')).toBe(true);
    expect(looksLikeMedicalAdvice('Give two tablets after food.')).toBe(true);
    expect(looksLikeMedicalAdvice('One puff of the inhaler when tight.')).toBe(true);
  });
});

describe('script matching', () => {
  it('accepts the correct script per language', () => {
    expect(scriptMatches('hi', 'हवा आज साफ़ है')).toBe(true);
    expect(scriptMatches('te', 'గాలి శుభ్రంగా ఉంది')).toBe(true);
    expect(scriptMatches('en', 'The air is clean today')).toBe(true);
  });

  it('rejects a mismatched script', () => {
    expect(scriptMatches('hi', 'The air is clean today')).toBe(false);
    expect(scriptMatches('te', 'हवा आज साफ़ है')).toBe(false);
    expect(scriptMatches('en', 'हवा आज साफ़ है')).toBe(false);
  });
});

describe('sanitizePlan', () => {
  it('removes markup from every plan string', () => {
    const plan = buildFallbackPlan({
      snapshot: SNAPSHOT,
      profile: PROFILE,
      language: 'en',
      severity: deriveIndices(SNAPSHOT).severity,
      naqiBand: deriveIndices(SNAPSHOT).naqi.band,
    });
    plan.headline = '<script>alert(1)</script>Headline';
    plan.indoorHacks[0]!.detail = '<img src=x onerror=alert(1)>Detail';

    const cleaned = sanitizePlan(plan);
    expect(cleaned.headline).toBe('Headline');
    expect(containsMarkup(cleaned.indoorHacks[0]!.detail)).toBe(false);
  });
});
