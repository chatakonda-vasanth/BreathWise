'use client';

import { useAppFlow } from '@/hooks/use-app-flow';
import { t } from '@/lib/i18n';
import { AppFooter } from './app/app-footer';
import { AppHeader } from './app/app-header';
import { MainSteps } from './app/app-steps';
import { PwaRegister } from './pwa-register';

/**
 * Client entry point. All state lives in `useAppFlow` and each step screen in
 * `MainSteps`, so this component is only the page skeleton.
 */
export function AppShell() {
  const flow = useAppFlow();
  const severity = flow.air.airData?.indices.severity ?? 'moderate';

  return (
    <div lang={flow.lang} data-band={severity}>
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded focus:bg-[var(--surface)] focus:px-3 focus:py-2"
      >
        {t(flow.lang, 'skipToContent')}
      </a>

      <div className="mx-auto max-w-3xl px-4 pb-16 pt-5">
        <AppHeader
          lang={flow.lang}
          theme={flow.theme}
          step={flow.step}
          onLanguage={flow.selectLanguage}
          onTheme={flow.setTheme}
        />

        {/* tabIndex -1 lets the skip link move real focus here. */}
        <main id="main" tabIndex={-1} className="mt-4 outline-none">
          <MainSteps flow={flow} />
        </main>

        <AppFooter lang={flow.lang} />
      </div>

      <PwaRegister />
    </div>
  );
}
