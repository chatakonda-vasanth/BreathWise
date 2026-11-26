'use client';

import { t, tList } from '@/lib/i18n';
import type { Language } from '@/lib/types';

/** Data attribution and the privacy explainer. */
export function AppFooter({ lang }: { lang: Language }) {
  return (
    <footer className="mt-10 border-t border-[var(--border)] pt-4 text-sm no-print">
      <p>{t(lang, 'footerData')}</p>
      <p className="hint mt-1">{t(lang, 'footerMedical')}</p>

      <details className="mt-3">
        <summary className="cursor-pointer font-semibold">
          {t(lang, 'privacyTitle')}
        </summary>
        <ul className="mt-2 list-disc space-y-1 pl-5">
          {tList(lang, 'privacyBody').map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      </details>
    </footer>
  );
}
