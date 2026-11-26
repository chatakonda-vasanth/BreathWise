'use client';

import { t } from '@/lib/i18n';
import type { Profile } from '@/lib/schemas';
import type { Language } from '@/lib/types';
import { CountFields } from './profile/count-fields';
import { HomeFields } from './profile/home-fields';
import { SensitivityFields } from './profile/sensitivity-fields';

interface ProfileFormProps {
  lang: Language;
  value: Profile;
  busy: boolean;
  onChange: (patch: Partial<Profile>) => void;
  onSubmit: () => void;
  onSkip: () => void;
  onBack: () => void;
}

/**
 * The quick profile form. Every control is a closed choice (or a bounded
 * number), so nothing typed can reach the model.
 */
export function ProfileForm({
  lang,
  value,
  busy,
  onChange,
  onSubmit,
  onSkip,
  onBack,
}: ProfileFormProps) {
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

      <CountFields lang={lang} value={value} onChange={onChange} />
      <SensitivityFields lang={lang} value={value} onChange={onChange} />
      <HomeFields lang={lang} value={value} onChange={onChange} />

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
