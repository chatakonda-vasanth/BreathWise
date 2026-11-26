'use client';

import { t } from '@/lib/i18n';
import type { Language } from '@/lib/types';
import { SectionHeading } from '../ui';

interface AirControlsProps {
  lang: Language;
  lowBandwidth: boolean;
  isSample: boolean;
  onToggleLowBandwidth: () => void;
  onUseSample: () => void;
  onUseLive: () => void;
}

/**
 * Heading plus the two view switches: low-bandwidth (hide the chart) and
 * sample/live data. Both are explicit and both are labelled, because the reader
 * must always know whether they are looking at real measurements.
 */
export function AirControls({
  lang,
  lowBandwidth,
  isSample,
  onToggleLowBandwidth,
  onUseSample,
  onUseLive,
}: AirControlsProps) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <SectionHeading id="air-heading">{t(lang, 'airTitle')}</SectionHeading>
      <div className="flex flex-wrap gap-2 no-print">
        <button
          type="button"
          className="btn text-sm"
          onClick={onToggleLowBandwidth}
          aria-pressed={lowBandwidth}
        >
          {lowBandwidth ? t(lang, 'lowBandwidthOff') : t(lang, 'lowBandwidthOn')}
        </button>
        {isSample ? (
          <button type="button" className="btn text-sm" onClick={onUseLive}>
            {t(lang, 'sampleOff')}
          </button>
        ) : (
          <button type="button" className="btn text-sm" onClick={onUseSample}>
            {t(lang, 'sampleOn')}
          </button>
        )}
      </div>
    </div>
  );
}
