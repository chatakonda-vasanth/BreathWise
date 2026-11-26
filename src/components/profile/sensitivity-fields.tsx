'use client';

import { t } from '@/lib/i18n';
import type { Profile } from '@/lib/schemas';
import type { Language } from '@/lib/types';

/**
 * Pregnancy, sensitivity and today's symptoms.
 *
 * These are the only personal-health signals the app accepts, and they only
 * change which guidance is shown — nothing is stored or sent to a third party.
 */
export function SensitivityFields({
  lang,
  value,
  onChange,
}: {
  lang: Language;
  value: Profile;
  onChange: (patch: Partial<Profile>) => void;
}) {
  return (
    <fieldset className="mt-4">
      <legend className="field-label">{t(lang, 'sensitive')}</legend>
      <div className="flex flex-col gap-2">
        <label className="check-row text-sm">
          <input
            type="checkbox"
            checked={value.pregnant}
            onChange={(event) => onChange({ pregnant: event.target.checked })}
          />
          {t(lang, 'pregnant')}
        </label>
        <label className="check-row text-sm">
          <input
            type="checkbox"
            checked={value.sensitiveGroup}
            onChange={(event) => onChange({ sensitiveGroup: event.target.checked })}
          />
          {t(lang, 'sensitive')}
        </label>
        <p className="hint">{t(lang, 'sensitiveHelp')}</p>
        <label className="check-row text-sm">
          <input
            type="checkbox"
            checked={value.symptoms}
            onChange={(event) => onChange({ symptoms: event.target.checked })}
          />
          {t(lang, 'symptoms')}
        </label>
        <p className="hint">{t(lang, 'symptomsHelp')}</p>
      </div>
    </fieldset>
  );
}
