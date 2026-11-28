import { describe, expect, it } from 'vitest';
import { IMPACT_FACTORS, compareWithWithout, whyThisPlanFits } from '@/lib/impact/impact';
import type { Profile } from '@/lib/shared/schemas';
import { PROFILE } from '../fixtures';

const base = { pm25: 200, language: 'en' as const };

describe('with vs without estimate', () => {
  it('models zero pollution as zero, not as a reduction', () => {
    const result = compareWithWithout({ pm25: 0, profile: PROFILE, language: 'en' });
    expect(result).not.toBeNull();
    expect(result?.baseline).toBe(0);
    expect(result?.withChanges).toBe(0);
    expect(result?.outdoorWithMask).toBe(0);
  });

  it('handles 500+ without going negative or exceeding the input', () => {
    const result = compareWithWithout({ pm25: 600, profile: PROFILE, language: 'en' });
    expect(result).not.toBeNull();
    expect(result?.baseline).toBe(600);
    expect(result?.withChanges).toBeGreaterThan(0);
    expect(result?.withChanges).toBeLessThan(600);
    // Low budget (DIY box 25%) + single glazing (10%) + timing (5%).
    const expected = 600 * (1 - 0.25) * (1 - 0.1) * (1 - 0.05);
    expect(result?.withChanges).toBe(Math.round(expected * 10) / 10);
  });

  it('works with no profile at all, using documented defaults', () => {
    const withProfile = compareWithWithout({ ...base, profile: PROFILE });
    const without = compareWithWithout({ ...base, profile: null });
    const undefinedProfile = compareWithWithout(base);
    expect(without).toEqual(withProfile);
    expect(undefinedProfile).toEqual(withProfile);
    // The reasons still render for an empty profile.
    expect(whyThisPlanFits(null, 'en').length).toBeGreaterThan(3);
  });

  it('uses a different purifier factor for each budget level', () => {
    const factorFor = (budget: Profile['budget']) => {
      const result = compareWithWithout({
        ...base,
        profile: { ...PROFILE, budget },
      });
      return result?.steps.find((step) => step.id === 'purifier')?.reductionPct;
    };

    expect(factorFor('low')).toBe(IMPACT_FACTORS.diyBox);
    expect(factorFor('medium')).toBe(IMPACT_FACTORS.hepa);
    expect(factorFor('high')).toBe(IMPACT_FACTORS.hepa);

    // A larger budget can never model a worse room result.
    const low = compareWithWithout({ ...base, profile: { ...PROFILE, budget: 'low' } });
    const high = compareWithWithout({ ...base, profile: { ...PROFILE, budget: 'high' } });
    expect(high?.withChanges).toBeLessThan(low?.withChanges ?? 0);
  });

  it('weights sealing by the glazing that was reported', () => {
    const sealFor = (windows: Profile['windows']) =>
      compareWithWithout({ ...base, profile: { ...PROFILE, windows } })?.steps.find(
        (step) => step.id === 'sealGaps',
      )?.reductionPct;

    expect(sealFor('single')).toBe(IMPACT_FACTORS.sealSingle);
    expect(sealFor('double')).toBe(IMPACT_FACTORS.sealDouble);
    expect(sealFor('unknown')).toBe(IMPACT_FACTORS.sealUnknown);
    expect(sealFor('sealed')).toBe(IMPACT_FACTORS.sealSealed);
  });

  it('models the mask against outdoor exposure only', () => {
    const result = compareWithWithout({ ...base, profile: PROFILE });
    const mask = result?.steps.find((step) => step.id === 'mask');
    expect(mask?.appliesTo).toBe('outdoors');
    expect(mask?.reductionPct).toBe(IMPACT_FACTORS.wellFittedMask);
    expect(result?.outdoorWithMask).toBe(
      Math.round(200 * (1 - IMPACT_FACTORS.wellFittedMask / 100) * 10) / 10,
    );
  });

  it('labels the estimate as rough in all three languages', () => {
    for (const language of ['en', 'hi', 'te'] as const) {
      const result = compareWithWithout({ ...base, language, profile: PROFILE });
      expect(result?.labels.roughEstimate.length).toBeGreaterThan(3);
      expect(result?.labels.unit).toBe('µg/m³');
      expect(result?.steps.every((step) => step.assumption.length > 20)).toBe(true);
    }
  });

  it('returns null when PM2.5 is unavailable or invalid', () => {
    expect(
      compareWithWithout({ pm25: null, profile: PROFILE, language: 'en' }),
    ).toBeNull();
    expect(
      compareWithWithout({ pm25: undefined, profile: PROFILE, language: 'en' }),
    ).toBeNull();
    expect(
      compareWithWithout({ pm25: Number.NaN, profile: PROFILE, language: 'en' }),
    ).toBeNull();
    expect(compareWithWithout({ pm25: -1, profile: PROFILE, language: 'en' })).toBeNull();
  });
});

describe('why this plan fits you', () => {
  it('names every household input that shaped the plan', () => {
    const reasons = whyThisPlanFits(
      {
        ...PROFILE,
        adults: 3,
        children: 2,
        elderly: 1,
        sensitiveGroup: true,
        pregnant: true,
        symptoms: true,
        homeType: 'house',
        windows: 'double',
        kitchenVentilation: 'none',
        commuteMode: 'cycle',
        budget: 'high',
        roomSizeSqm: 30,
      },
      'en',
    );
    const text = reasons.join('\n');
    expect(text).toContain('3 adult');
    expect(text).toContain('2 child');
    expect(text).toContain('1 elderly');
    expect(text).toContain('sensitive-group');
    expect(text).toContain('pregnant');
    expect(text).toContain('Symptoms');
    expect(text).toContain('house');
    expect(text).toContain('double');
    expect(text).toContain('none');
    expect(text).toContain('cycle');
    expect(text).toContain('high');
    expect(text).toContain('30 m²');
  });

  it('omits the toggles that are off and the optional room size', () => {
    const text = whyThisPlanFits(PROFILE, 'en').join('\n');
    expect(text).not.toContain('sensitive-group');
    expect(text).not.toContain('pregnant');
    expect(text).not.toContain('Symptoms');
    expect(text).toContain('22 m²');
  });

  it('speaks the selected language', () => {
    expect(whyThisPlanFits(PROFILE, 'hi').join(' ')).toMatch(/[\u0900-\u097F]/);
    expect(whyThisPlanFits(PROFILE, 'te').join(' ')).toMatch(/[\u0C00-\u0C7F]/);
  });
});
