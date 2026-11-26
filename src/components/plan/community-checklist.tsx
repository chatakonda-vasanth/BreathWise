'use client';

import { t, tList } from '@/lib/i18n';
import type { Language } from '@/lib/types';
import { SectionHeading } from '../ui';

/**
 * Community actions the household can take today.
 *
 * The checkboxes are a paper-style list for the reader, not saved state: nothing
 * is stored, which is why the privacy notice can promise no tracking.
 */
export function CommunityChecklist({ lang }: { lang: Language }) {
  return (
    <section className="mt-5" aria-labelledby="community-heading">
      <SectionHeading id="community-heading">{t(lang, 'communityTitle')}</SectionHeading>
      <div className="card mt-2">
        <p className="hint">{t(lang, 'communityHelp')}</p>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
          {tList(lang, 'communityItems').map((item) => (
            <li key={item}>
              <label className="check-row">
                <input type="checkbox" aria-label={item} />
                <span>{item}</span>
              </label>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
