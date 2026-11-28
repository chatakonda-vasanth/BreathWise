import type { Language, SeverityBand } from '@/lib/shared/types';
import type { BandCopy, ItemCopy, LanguageCopy } from './types';
import { EN } from './en';
import { HI } from './hi';
import { TE } from './te';

export type { BandCopy, ItemCopy,  };

/**
 * Deterministic, reviewed copy for the rule-based fallback plan.
 *
 * Kept in one place so all three languages stay in step and can be reviewed
 * without reading code. Each language lives in its own file; this module only
 * indexes them.
 */

const PACKS: Record<Language, LanguageCopy> = { en: EN, hi: HI, te: TE };

/** Per-band headlines and guidance. */
export const BAND_COPY: Record<Language, Record<SeverityBand, BandCopy>> = {
  en: PACKS.en.bands,
  hi: PACKS.hi.bands,
  te: PACKS.te.bands,
};

/** Indoor air-quality recommendations. */
export const INDOOR_ITEMS: Record<Language, ItemCopy[]> = {
  en: PACKS.en.indoor,
  hi: PACKS.hi.indoor,
  te: PACKS.te.indoor,
};

/** Low-emission and community alternatives. */
export const SUSTAINABLE_ITEMS: Record<Language, ItemCopy[]> = {
  en: PACKS.en.sustainable,
  hi: PACKS.hi.sustainable,
  te: PACKS.te.sustainable,
};

export function hepaCadr(roomSizeSqm: number, ceilingM = 2.4, ach = 5): number {
  return Math.round(roomSizeSqm * ceilingM * ach);
}
