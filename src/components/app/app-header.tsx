'use client';

import { LANGUAGE_NAMES, t } from '@/lib/i18n';
import type { Language } from '@/lib/shared/types';
import type { Step, ThemeChoice } from '@/hooks/use-app-flow';
import { Banner } from '../ui';

const STEP_KEYS = ['stepLocation', 'stepProfile', 'stepPlan'] as const;
const THEMES: ThemeChoice[] = ['auto', 'light', 'dark'];

interface AppHeaderProps {
  lang: Language;
  theme: ThemeChoice;
  step: Step;
  onLanguage: (lang: Language) => void;
  onTheme: (theme: ThemeChoice) => void;
}

/** The progress list: where the reader is in the three steps. */
function StepProgress({ lang, step }: { lang: Language; step: Step }) {
  return (
    <ol className="mt-4 flex flex-wrap gap-2 text-sm" aria-label={t(lang, 'progress')}>
      {STEP_KEYS.map((key, index) => {
        const value = index + 1;
        const isCurrent = step === value;
        return (
          <li key={key}>
            <span
              className={`pill ${isCurrent ? 'band-solid-bg' : ''}`}
              aria-current={isCurrent ? 'step' : undefined}
            >
              <span aria-hidden="true">{value}.</span> {t(lang, key)}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

/** Language and theme switchers, grouped so each control has one label. */
function DisplayControls({
  lang,
  theme,
  onLanguage,
  onTheme,
}: Omit<AppHeaderProps, 'step'>) {
  return (
    <div className="flex flex-col items-end gap-2">
      <div className="flex gap-1" role="group" aria-label={t(lang, 'language')}>
        {(Object.keys(LANGUAGE_NAMES) as Language[]).map((code) => (
          <button
            key={code}
            type="button"
            className={`btn min-w-11 px-3 py-1 text-sm ${code === lang ? 'btn-primary' : ''}`}
            aria-pressed={code === lang}
            onClick={() => onLanguage(code)}
          >
            {LANGUAGE_NAMES[code]}
          </button>
        ))}
      </div>
      <div className="flex gap-1" role="group" aria-label={t(lang, 'theme')}>
        {THEMES.map((choice) => (
          <button
            key={choice}
            type="button"
            className={`btn min-w-11 px-2 py-1 text-xs ${theme === choice ? 'btn-primary' : ''}`}
            aria-pressed={theme === choice}
            onClick={() => onTheme(choice)}
          >
            {choice}
          </button>
        ))}
      </div>
    </div>
  );
}

/**
 * Title, language and theme switchers, the medical notice and the progress
 * list. Kept out of `AppShell` so the stateful component stays readable.
 */
export function AppHeader({ lang, theme, step, onLanguage, onTheme }: AppHeaderProps) {
  return (
    <header className="no-print">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold leading-tight sm:text-3xl">
            {t(lang, 'appName')}
          </h1>
          <p className="hint mt-1 max-w-prose">{t(lang, 'tagline')}</p>
        </div>
        <DisplayControls lang={lang} theme={theme} onLanguage={onLanguage} onTheme={onTheme} />
      </div>

      <div className="mt-3">
        <Banner tone="info">
          <strong>{t(lang, 'medicalNotice')}</strong>
        </Banner>
      </div>

      <StepProgress lang={lang} step={step} />
    </header>
  );
}
