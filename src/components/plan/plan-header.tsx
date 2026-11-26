'use client';

import { BAND_COLOURS } from '@/lib/aqi';
import { SEVERITY_LABELS, t } from '@/lib/i18n';
import type { Language, SeverityBand } from '@/lib/types';
import { BandChip, SectionHeading } from '../ui';

/**
 * Heading and band chip above a plan.
 *
 * The chip repeats the band as text and as a glyph, so colour is never the only
 * indicator of severity.
 */
export function PlanHeader({
  lang,
  severity,
}: {
  lang: Language;
  severity: SeverityBand;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <SectionHeading id="plan-heading">{t(lang, 'stepPlan')}</SectionHeading>
      <BandChip
        band={severity}
        label={SEVERITY_LABELS[lang][severity]}
        glyph={BAND_COLOURS[severity].glyph}
      />
    </div>
  );
}
