'use client';

import { t } from '@/lib/i18n';
import type { Language } from '@/lib/shared/types';

interface PlanActionsProps {
  lang: Language;
  /** Pre-encoded WhatsApp share link for the plan text. */
  whatsappHref: string;
  speaking: boolean;
  speechError: string | null;
  copied: boolean;
  onToggleReading: () => void;
  onCopy: () => void;
  onRegenerate: () => void;
  onBack: () => void;
}

/**
 * The action row under a plan: read aloud, copy, share, print, regenerate, back.
 *
 * Every action works offline except the share link, and none of them sends the
 * plan anywhere: copy and speech use local browser APIs.
 */
export function PlanActions({
  lang,
  whatsappHref,
  speaking,
  speechError,
  copied,
  onToggleReading,
  onCopy,
  onRegenerate,
  onBack,
}: PlanActionsProps) {
  return (
    <>
      <div className="mt-4 flex flex-wrap gap-2 no-print">
        <button
          type="button"
          className="btn"
          onClick={onToggleReading}
          aria-pressed={speaking}
        >
          {speaking ? t(lang, 'stopReading') : t(lang, 'readAloud')}
        </button>
        <button type="button" className="btn" onClick={onCopy}>
          {copied ? t(lang, 'copied') : t(lang, 'copy')}
        </button>
        <a className="btn" href={whatsappHref} target="_blank" rel="noopener noreferrer">
          {t(lang, 'whatsapp')}
        </a>
        <button type="button" className="btn" onClick={() => window.print()}>
          {t(lang, 'print')}
        </button>
        <button type="button" className="btn" onClick={onRegenerate}>
          {t(lang, 'retry')}
        </button>
        <button type="button" className="btn" onClick={onBack}>
          {t(lang, 'back')}
        </button>
      </div>

      {speechError ? (
        <p className="mt-2 text-sm font-semibold" role="status">
          {speechError}
        </p>
      ) : null}
    </>
  );
}
