'use client';

import { useCallback, useEffect, useState } from 'react';
import type { AskQuestion } from '@/lib/ai/askQuestions';
import { roundCoord } from '@/lib/air/geo';
import { loadLanguage } from '@/lib/i18n';
import type { SelectedLocation } from '@/lib/shared/location';
import type { Profile } from '@/lib/shared/schemas';
import type { Language } from '@/lib/shared/types';
import { useAirData, type AirState } from './use-air-data';
import type { PlanRequestInput } from './plan-request-input';
import { usePlanRequest, type PlanState } from './use-plan-request';

/** The household defaults: a small urban family, no stated sensitivities. */
export const DEFAULT_PROFILE: Profile = {
  adults: 2,
  children: 1,
  elderly: 0,
  pregnant: false,
  sensitiveGroup: false,
  homeType: 'apartment',
  windows: 'single',
  kitchenVentilation: 'exhaustFan',
  commuteMode: 'bus',
  budget: 'low',
  language: 'en',
  symptoms: false,
};

export type Step = 1 | 2 | 3;
export type ThemeChoice = 'auto' | 'light' | 'dark';

/** Everything the screen needs: state, derived air data and the handlers. */
export interface AppFlow {
  lang: Language;
  theme: ThemeChoice;
  step: Step;
  location: SelectedLocation | null;
  profile: Profile;
  lowBandwidth: boolean;
  air: AirState;
  plan: PlanState;
  setTheme: (theme: ThemeChoice) => void;
  setStep: (step: Step) => void;
  setLowBandwidth: (value: boolean) => void;
  patchProfile: (patch: Partial<Profile>) => void;
  /** Round, store and load a place, then move to the profile step. */
  selectLocation: (selected: SelectedLocation) => void;
  /** Load the language pack first, so no frame renders half-translated. */
  selectLanguage: (code: Language) => void;
  /** Generate (or reuse) the plan for the current profile and place. */
  submitPlan: () => Promise<void>;
  /** Replace a slow generation with the local deterministic plan. */
  cancelPlan: () => void;
  /** Ask one fixed quick question. */
  askQuestion: (question: AskQuestion) => Promise<void>;
  /** Back to the location step, dropping the current plan. */
  startOver: () => void;
}

/** Keep the document theme attribute in sync with the choice. */
function useDocumentTheme(theme: ThemeChoice): void {
  useEffect(() => {
    if (theme === 'auto') {
      delete document.documentElement.dataset.theme;
    } else {
      document.documentElement.dataset.theme = theme;
    }
  }, [theme]);
}

/** Keep the document language in sync for screen readers. */
function useDocumentLanguage(lang: Language): void {
  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);
}

/**
 * Language and theme, including the document side effects and the rule that a
 * language pack must be loaded before it is rendered.
 */
function usePreferences() {
  const [lang, setLang] = useState<Language>('en');
  const [theme, setTheme] = useState<ThemeChoice>('auto');
  useDocumentTheme(theme);
  useDocumentLanguage(lang);

  return {
    lang,
    theme,
    setTheme,
    selectLanguage: (code: Language) => {
      void (async () => {
        if (code === lang) return;
        await loadLanguage(code);
        setLang(code);
      })();
    },
  };
}

/**
 * The whole client flow: place, profile, plan and the fixed questions.
 *
 * Composed from `usePreferences`, `useAirData` and `usePlanRequest` so this hook
 * only holds the navigation state and the bindings between them.
 */
export function useAppFlow(): AppFlow {
  const { lang, theme, setTheme, selectLanguage } = usePreferences();
  const [step, setStep] = useState<Step>(1);
  const [location, setLocation] = useState<SelectedLocation | null>(null);
  const [profile, setProfile] = useState<Profile>(DEFAULT_PROFILE);
  const [lowBandwidth, setLowBandwidth] = useState(false);

  const air = useAirData(lang);
  const advanceToPlan = useCallback(() => setStep(3), []);
  const plan = usePlanRequest(advanceToPlan);

  /** The request inputs for the current selection, or null before a place. */
  function currentInput(): PlanRequestInput | null {
    if (!location) return null;
    return { profile, lang, airData: air.airData, location };
  }

  function selectLocation(selected: SelectedLocation): void {
    const normalised: SelectedLocation = {
      lat: roundCoord(selected.lat),
      lon: roundCoord(selected.lon),
      label: selected.label,
    };
    setLocation(normalised);
    setStep(2);
    plan.clear();
    void air.load(normalised);
  }

  return {
    lang,
    theme,
    step,
    location,
    profile,
    lowBandwidth,
    air,
    plan,
    setTheme,
    setStep,
    setLowBandwidth,
    patchProfile: (patch) => setProfile((current) => ({ ...current, ...patch })),
    selectLocation,
    selectLanguage,
    submitPlan: async () => {
      const input = currentInput();
      if (input) await plan.submit(input);
    },
    cancelPlan: () => {
      const input = currentInput();
      if (input) plan.cancel(input);
    },
    askQuestion: async (question) => {
      const input = currentInput();
      if (input) await plan.ask(input, question);
    },
    startOver: () => {
      setStep(1);
      plan.clear();
    },
  };
}
