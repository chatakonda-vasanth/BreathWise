'use client';

import { t } from '@/lib/i18n';
import type { Profile } from '@/lib/schemas';
import type { Language } from '@/lib/types';

const NUMBER_FIELDS = [
  { key: 'adults', labelKey: 'adults', max: 12 },
  { key: 'children', labelKey: 'children', max: 12 },
  { key: 'elderly', labelKey: 'elderly', max: 8 },
] as const;

/** Clamp a typed count to whole numbers in `[0, max]`. */
function clampNumber(raw: string, max: number): number {
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed)) return 0;
  return Math.min(Math.max(parsed, 0), max);
}

/** Adults, children and elderly people, as bounded number inputs. */
export function CountFields({
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
      <legend className="field-label">{t(lang, 'profileTitle')}</legend>
      <div className="grid grid-cols-3 gap-3">
        {NUMBER_FIELDS.map((field) => (
          <div key={field.key}>
            <label className="field-label" htmlFor={`profile-${field.key}`}>
              {t(lang, field.labelKey)}
            </label>
            <input
              id={`profile-${field.key}`}
              className="input tabular-nums"
              type="number"
              inputMode="numeric"
              min={0}
              max={field.max}
              step={1}
              value={value[field.key]}
              onChange={(event) =>
                onChange({ [field.key]: clampNumber(event.target.value, field.max) })
              }
            />
          </div>
        ))}
      </div>
    </fieldset>
  );
}
