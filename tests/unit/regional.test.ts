import { describe, expect, it } from 'vitest';
import { coarseRegion, regionalContext, regionalLabels, seasonFor } from '@/lib/air/regional';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const NOVEMBER = new Date('2026-11-15T00:00:00Z');
const JANUARY = new Date('2026-01-15T00:00:00Z');
const JULY = new Date('2026-07-15T00:00:00Z');
const APRIL = new Date('2026-04-15T00:00:00Z');

describe('coarse region lookup', () => {
  it('maps representative coordinates without any place lookup', () => {
    expect(coarseRegion(28.61, 77.21)).toBe('north'); // Delhi
    expect(coarseRegion(19.07, 72.87)).toBe('west'); // Mumbai
    expect(coarseRegion(22.57, 88.36)).toBe('east'); // Kolkata
    expect(coarseRegion(13.08, 80.27)).toBe('south'); // Chennai
    expect(coarseRegion(17.38, 78.48)).toBe('central'); // Hyderabad
  });

  it('returns other outside the region, and for invalid input', () => {
    expect(coarseRegion(51.5, -0.12)).toBe('other');
    expect(coarseRegion(Number.NaN, 77)).toBe('other');
    expect(coarseRegion(28, Number.POSITIVE_INFINITY)).toBe('other');
  });
});

describe('season mapping', () => {
  it('uses the South Asian meteorological seasons', () => {
    expect(seasonFor(11)).toBe('winter');
    expect(seasonFor(0)).toBe('winter');
    expect(seasonFor(1)).toBe('winter');
    expect(seasonFor(2)).toBe('preMonsoon');
    expect(seasonFor(4)).toBe('preMonsoon');
    expect(seasonFor(5)).toBe('monsoon');
    expect(seasonFor(8)).toBe('monsoon');
    expect(seasonFor(9)).toBe('postMonsoon');
    expect(seasonFor(10)).toBe('postMonsoon');
  });
});

describe('regional context', () => {
  it('flags the residue-burning window in the north in November', () => {
    const context = regionalContext(28.61, 77.21, NOVEMBER, 'en');
    expect(context.region).toBe('north');
    // November is still the post-monsoon season; the burning window sits in it.
    expect(context.season).toBe('postMonsoon');
    expect(context.cropBurningSeason).toBe(true);
    expect(context.notes.join(' ')).toMatch(/residue-burning/i);
  });

  it('flags winter inversion in January for the north', () => {
    const context = regionalContext(28.61, 77.21, JANUARY, 'en');
    expect(context.inversionLikely).toBe(true);
    expect(context.notes.join(' ')).toMatch(/still nights/i);
  });

  it('does not flag burning or inversion in the south', () => {
    const context = regionalContext(13.08, 80.27, NOVEMBER, 'en');
    expect(context.region).toBe('south');
    expect(context.cropBurningSeason).toBe(false);
    expect(context.inversionLikely).toBe(false);
  });

  it('switches guidance for the monsoon and pre-monsoon', () => {
    expect(regionalContext(19.07, 72.87, JULY, 'en').notes.join(' ')).toMatch(/monsoon/i);
    expect(regionalContext(19.07, 72.87, APRIL, 'en').notes.join(' ')).toMatch(
      /dustiest/i,
    );
  });

  it('reports the heating fuel for the coarse region', () => {
    expect(regionalContext(28.61, 77.21, JANUARY, 'en').heatingFuel).toBe('mixed');
    expect(regionalContext(22.57, 88.36, JANUARY, 'en').heatingFuel).toBe('biomass');
    expect(regionalContext(13.08, 80.27, JANUARY, 'en').heatingFuel).toBe('electric');
    expect(regionalContext(51.5, -0.12, JANUARY, 'en').heatingFuel).toBe('unknown');
  });

  it('always carries at least one note, in every language', () => {
    for (const language of ['en', 'hi', 'te'] as const) {
      const context = regionalContext(28.61, 77.21, JANUARY, language);
      expect(context.notes.length).toBeGreaterThan(0);
      expect(context.notes.every((note) => note.length > 20)).toBe(true);
      expect(regionalLabels(language).assumption.length).toBeGreaterThan(10);
    }
  });

  it('never echoes the coordinates back in its copy', () => {
    const context = regionalContext(28.61, 77.21, NOVEMBER, 'en');
    expect(context.notes.join(' ')).not.toContain('28.61');
    expect(context.notes.join(' ')).not.toContain('77.21');
  });
});

describe('the regional layer never reaches the model', () => {
  const root = join(process.cwd(), 'src', 'lib', 'ai');

  it('is not imported by the prompt builder, planner or Gemini client', () => {
    for (const file of ['prompt.ts', 'planService.ts', 'gemini.ts']) {
      const source = readFileSync(join(root, file), 'utf8');
      expect(source).not.toMatch(/from ['"][^'"]*regional['"]/);
      expect(source).not.toMatch(/from ['"][^'"]*impact['"]/);
    }
  });
});
