'use client';

import { t } from '@/lib/i18n';
import type { Profile } from '@/lib/shared/schemas';
import type { Language } from '@/lib/shared/types';

function CheckRow({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="check-row text-sm">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
      />
      {label}
    </label>
  );
}

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
        <CheckRow
          label={t(lang, 'pregnant')}
          checked={value.pregnant}
          onChange={(pregnant) => onChange({ pregnant })}
        />
        <CheckRow
          label={t(lang, 'sensitive')}
          checked={value.sensitiveGroup}
          onChange={(sensitiveGroup) => onChange({ sensitiveGroup })}
        />
        <p className="hint">{t(lang, 'sensitiveHelp')}</p>
        <CheckRow
          label={t(lang, 'symptoms')}
          checked={value.symptoms}
          onChange={(symptoms) => onChange({ symptoms })}
        />
        <p className="hint">{t(lang, 'symptomsHelp')}</p>
      </div>
    </fieldset>
  );
}
