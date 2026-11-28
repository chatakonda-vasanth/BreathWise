'use client';

import { t } from '@/lib/i18n';
import type { Profile } from '@/lib/shared/schemas';
import type { Language } from '@/lib/shared/types';

/** An i18n key the translator understands. */
type MessageKey = Parameters<typeof t>[1];

interface OptionDef {
  value: string;
  key: MessageKey;
}

const HOME_TYPES: OptionDef[] = [
  { value: 'apartment', key: 'apartment' },
  { value: 'house', key: 'house' },
  { value: 'other', key: 'other' },
];

const WINDOWS: OptionDef[] = [
  { value: 'single', key: 'single' },
  { value: 'double', key: 'double' },
  { value: 'sealed', key: 'sealed' },
  { value: 'unknown', key: 'unknown' },
];

const KITCHEN: OptionDef[] = [
  { value: 'chimney', key: 'chimney' },
  { value: 'exhaustFan', key: 'exhaustFan' },
  { value: 'window', key: 'windowVent' },
  { value: 'none', key: 'none' },
  { value: 'unknown', key: 'unknown' },
];

const COMMUTE: OptionDef[] = [
  { value: 'walk', key: 'walk' },
  { value: 'cycle', key: 'cycle' },
  { value: 'bus', key: 'bus' },
  { value: 'metro', key: 'metro' },
  { value: 'twoWheeler', key: 'twoWheeler' },
  { value: 'car', key: 'car' },
  { value: 'wfh', key: 'wfh' },
];

const BUDGETS: OptionDef[] = [
  { value: 'low', key: 'low' },
  { value: 'medium', key: 'medium' },
  { value: 'high', key: 'high' },
];

/** Translate a closed option list for the current language. */
function optionsFor(
  lang: Language,
  defs: OptionDef[],
): { value: string; label: string }[] {
  return defs.map((def) => ({ value: def.value, label: t(lang, def.key) }));
}

/** A labelled `<select>` over a closed list; the value is re-validated by zod. */
function SelectField({
  id,
  label,
  value,
  options,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
}) {
  return (
    <div>
      <label className="field-label" htmlFor={id}>
        {label}
      </label>
      <select
        id={id}
        className="select"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}

/** Parse the room-size input, returning the patch to apply (or null to ignore). */
function roomSizePatch(raw: string): Partial<Profile> | null {
  if (raw === '') return { roomSizeSqm: undefined };
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return null;
  return { roomSizeSqm: Math.min(Math.max(parsed, 5), 200) };
}

/** Main room area, which drives the purifier sizing and the impact estimate. */
function RoomSizeField({
  lang,
  value,
  onChange,
}: {
  lang: Language;
  value: number | undefined;
  onChange: (patch: Partial<Profile>) => void;
}) {
  return (
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
        value={value ?? ''}
        onChange={(event) => {
          const patch = roomSizePatch(event.target.value);
          if (patch) onChange(patch);
        }}
        aria-describedby="profile-room-hint"
      />
      <p className="hint" id="profile-room-hint">
        {t(lang, 'roomSizeHelp')}
      </p>
    </div>
  );
}

interface HomeFieldsProps {
  lang: Language;
  value: Profile;
  onChange: (patch: Partial<Profile>) => void;
}

/** The three building-shell choices. */
function HomeShellFields({ lang, value, onChange }: HomeFieldsProps) {
  return (
    <>
      <SelectField
        id="profile-home"
        label={t(lang, 'homeType')}
        value={value.homeType}
        options={optionsFor(lang, HOME_TYPES)}
        onChange={(next) => onChange({ homeType: next as Profile['homeType'] })}
      />
      <SelectField
        id="profile-windows"
        label={t(lang, 'windows')}
        value={value.windows}
        options={optionsFor(lang, WINDOWS)}
        onChange={(next) => onChange({ windows: next as Profile['windows'] })}
      />
      <SelectField
        id="profile-kitchen"
        label={t(lang, 'kitchen')}
        value={value.kitchenVentilation}
        options={optionsFor(lang, KITCHEN)}
        onChange={(next) =>
          onChange({ kitchenVentilation: next as Profile['kitchenVentilation'] })
        }
      />
    </>
  );
}

/** Commute, budget and the main room's area. */
function LifestyleFields({ lang, value, onChange }: HomeFieldsProps) {
  return (
    <>
      <SelectField
        id="profile-commute"
        label={t(lang, 'commute')}
        value={value.commuteMode}
        options={optionsFor(lang, COMMUTE)}
        onChange={(next) => onChange({ commuteMode: next as Profile['commuteMode'] })}
      />
      <SelectField
        id="profile-budget"
        label={t(lang, 'budget')}
        value={value.budget}
        options={optionsFor(lang, BUDGETS)}
        onChange={(next) => onChange({ budget: next as Profile['budget'] })}
      />
      <RoomSizeField lang={lang} value={value.roomSizeSqm} onChange={onChange} />
    </>
  );
}

/** Home, glazing, kitchen, commute, budget and room size. */
export function HomeFields(props: HomeFieldsProps) {
  return (
    <div className="mt-4 grid gap-3 sm:grid-cols-2">
      <HomeShellFields {...props} />
      <LifestyleFields {...props} />
    </div>
  );
}
