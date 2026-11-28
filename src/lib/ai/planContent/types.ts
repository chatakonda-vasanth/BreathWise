import type { SeverityBand } from '@/lib/shared/types';

/** One severity band's reviewed, deterministic copy. */
export interface BandCopy {
  headline: string;
  meaning: string;
  bestTime: string;
  mask: string;
  school: string;
  exercise: string;
}

/** One reviewed recommendation: what it is, why it works, how much it helps. */
export interface ItemCopy {
  title: string;
  detail: string;
  mechanism: string;
  reduction: string;
  assumption: string;
  confidence: 'High' | 'Medium' | 'Low';
}

/** The three reviewed blocks of copy that make up one language pack. */
export interface LanguageCopy {
  bands: Record<SeverityBand, BandCopy>;
  indoor: ItemCopy[];
  sustainable: ItemCopy[];
}
