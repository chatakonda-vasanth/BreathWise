'use client';

import { t } from '@/lib/i18n';
import type { Profile } from '@/lib/schemas';
import type { Language } from '@/lib/types';

interface ProfileFormProps {
  lang: Language;
  value: Profile;
  busy: boolean;
  onChange: (patch: Partial<Profile>) => void;
  onSubmit: () => void;
  onSkip: () => void;
  onBack: () => void;
}

const NUMBER_FIELDS = [
  { key: 'adults', labelKey: 'adults', max: 12 },
  { key: 'children', labelKey: 'children', max: 12 },
  { key: 'elderly', labelKey: 'elderly', max: 8 },
] as const;

export function ProfileForm({
  lang,
  value,
  busy,
  onChange,
  onSubmit,
  onSkip,
  onBack,
}: ProfileFormProps) {
  function clampNumber(raw: string, max: number): number {
    const parsed = Number.parseInt(raw, 10);
    if (!Number.isFinite(parsed)) return 0;
    return Math.min(Math.max(parsed, 0), max);
  }

  return (
    <form
      className="card"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit();
      }}
      aria-labelledby="profile-heading"
    >
      <h2 id="profile-heading" className="text-lg font-bold">
        {t(lang, 'profileTitle')}
      </h2>
      <p className="hint mt-1">{t(lang, 'profileHelp')}</p>

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

      <fieldset className="mt-4">
        <legend className="field-label">{t(lang, 'sensitive')}</legend>
        <div className="flex flex-col gap-2">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="h-5 w-5"
              checked={value.pregnant}
              onChange={(event) => onChange({ pregnant: event.target.checked })}
            />
            {t(lang, 'pregnant')}
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="h-5 w-5"
              checked={value.sensitiveGroup}
              onChange={(event) => onChange({ sensitiveGroup: event.target.checked })}
            />
            {t(lang, 'sensitive')}
          </label>
          <p className="hint">{t(lang, 'sensitiveHelp')}</p>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="h-5 w-5"
              checked={value.symptoms}
              onChange={(event) => onChange({ symptoms: event.target.checked })}
            />
            {t(lang, 'symptoms')}
          </label>
          <p className="hint">{t(lang, 'symptomsHelp')}</p>
        </div>
      </fieldset>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <div>
          <label className="field-label" htmlFor="profile-home">
            {t(lang, 'homeType')}
          </label>
          <select
            id="profile-home"
            className="select"
            value={value.homeType}
            onChange={(event) =>
              onChange({ homeType: event.target.value as Profile['homeType'] })
            }
          >
            <option value="apartment">{t(lang, 'apartment')}</option>
            <option value="house">{t(lang, 'house')}</option>
            <option value="other">{t(lang, 'other')}</option>
          </select>
        </div>

        <div>
          <label className="field-label" htmlFor="profile-windows">
            {t(lang, 'windows')}
          </label>
          <select
            id="profile-windows"
            className="select"
            value={value.windows}
            onChange={(event) =>
              onChange({ windows: event.target.value as Profile['windows'] })
            }
          >
            <option value="single">{t(lang, 'single')}</option>
            <option value="double">{t(lang, 'double')}</option>
            <option value="sealed">{t(lang, 'sealed')}</option>
            <option value="unknown">{t(lang, 'unknown')}</option>
          </select>
        </div>

        <div>
          <label className="field-label" htmlFor="profile-kitchen">
            {t(lang, 'kitchen')}
          </label>
          <select
            id="profile-kitchen"
            className="select"
            value={value.kitchenVentilation}
            onChange={(event) =>
              onChange({
                kitchenVentilation: event.target.value as Profile['kitchenVentilation'],
              })
            }
          >
            <option value="chimney">{t(lang, 'chimney')}</option>
            <option value="exhaustFan">{t(lang, 'exhaustFan')}</option>
            <option value="window">{t(lang, 'windowVent')}</option>
            <option value="none">{t(lang, 'none')}</option>
            <option value="unknown">{t(lang, 'unknown')}</option>
          </select>
        </div>

        <div>
          <label className="field-label" htmlFor="profile-commute">
            {t(lang, 'commute')}
          </label>
          <select
            id="profile-commute"
            className="select"
            value={value.commuteMode}
            onChange={(event) =>
              onChange({ commuteMode: event.target.value as Profile['commuteMode'] })
            }
          >
            <option value="walk">{t(lang, 'walk')}</option>
            <option value="cycle">{t(lang, 'cycle')}</option>
            <option value="bus">{t(lang, 'bus')}</option>
            <option value="metro">{t(lang, 'metro')}</option>
            <option value="twoWheeler">{t(lang, 'twoWheeler')}</option>
            <option value="car">{t(lang, 'car')}</option>
            <option value="wfh">{t(lang, 'wfh')}</option>
          </select>
        </div>

        <div>
          <label className="field-label" htmlFor="profile-budget">
            {t(lang, 'budget')}
          </label>
          <select
            id="profile-budget"
            className="select"
            value={value.budget}
            onChange={(event) =>
              onChange({ budget: event.target.value as Profile['budget'] })
            }
          >
            <option value="low">{t(lang, 'low')}</option>
            <option value="medium">{t(lang, 'medium')}</option>
            <option value="high">{t(lang, 'high')}</option>
          </select>
        </div>

        <div>
          <label className="field-label" htmlFor="profile-room">
            {t(lang, 'roomSize')}
          </label>
          <input
            id="profile-room"
            className="input tabular-nums"
            type="number"
            inputMode="decimal"
            min={5}
            max={200}
            step={1}
            value={value.roomSizeSqm ?? ''}
            onChange={(event) => {
              const raw = event.target.value;
              if (raw === '') {
                onChange({ roomSizeSqm: undefined });
                return;
              }
              const parsed = Number(raw);
              if (!Number.isFinite(parsed)) return;
              onChange({ roomSizeSqm: Math.min(Math.max(parsed, 5), 200) });
            }}
            aria-describedby="profile-room-hint"
          />
          <p className="hint" id="profile-room-hint">
            {t(lang, 'roomSizeHelp')}
          </p>
        </div>
      </div>

      <p className="hint mt-3">{t(lang, 'privacyProfile')}</p>

      <div className="mt-4 flex flex-wrap gap-2">
        <button className="btn btn-primary" type="submit" disabled={busy}>
          {busy ? t(lang, 'generating') : t(lang, 'generatePlan')}
        </button>
        <button className="btn" type="button" onClick={onSkip} disabled={busy}>
          {t(lang, 'skip')}
        </button>
        <button className="btn" type="button" onClick={onBack} disabled={busy}>
          {t(lang, 'back')}
        </button>
      </div>
    </form>
  );
}
