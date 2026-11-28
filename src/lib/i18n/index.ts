import type { Language, NaqiBand, SeverityBand, UsBand } from '@/lib/shared/types';
import { en, type UiKey } from './en';

export type { UiKey };

/**
 * UI strings for the three supported languages.
 *
 * English ships in the first-load bundle because it is the default and the
 * source of truth for the key type. Hindi and Telugu are separate chunks that
 * are fetched the first time someone selects them, so a reader who never
 * switches language never downloads Devanagari or Telugu text.
 *
 * `t()` is synchronous, so a language pack must be loaded before rendering in
 * that language — `loadLanguage()` is the only way in, and the language buttons
 * await it before switching.
 */
const loaded: Partial<Record<Language, Record<UiKey, string | string[]>>> = {};

/** Fetch a language pack once. No-op for English and for already-loaded packs. */
export async function loadLanguage(language: Language): Promise<void> {
  if (language === 'en' || loaded[language]) return;
  loaded[language] =
    language === 'hi' ? (await import('./hi')).hi : (await import('./te')).te;
}

function dictionary(language: Language): Record<UiKey, string | string[]> {
  // Falling back to English keeps the UI readable if a pack failed to load;
  // it is a degraded state, not a crash.
  return loaded[language] ?? en;
}

/** One string, with list values joined for labels that need a flat title. */
export function t(language: Language, key: UiKey): string {
  const value = dictionary(language)[key];
  return typeof value === 'string' ? value : value.join(' ');
}

/** One list string (checklists, privacy bullets). */
export function tList(language: Language, key: UiKey): string[] {
  const value = dictionary(language)[key];
  return Array.isArray(value) ? value : [value];
}

export const LANGUAGE_NAMES: Record<Language, string> = {
  en: 'English',
  hi: 'हिन्दी',
  te: 'తెలుగు',
};

/** AQI band names, always shown as text next to the colour. */
export const SEVERITY_LABELS: Record<Language, Record<SeverityBand, string>> = {
  en: {
    good: 'Good',
    moderate: 'Moderate',
    sensitive: 'Unhealthy for sensitive groups',
    unhealthy: 'Unhealthy',
    veryUnhealthy: 'Very unhealthy',
    hazardous: 'Hazardous',
  },
  hi: {
    good: 'अच्छा',
    moderate: 'मध्यम',
    sensitive: 'संवेदनशील समूहों के लिए अस्वस्थ',
    unhealthy: 'अस्वस्थ',
    veryUnhealthy: 'बहुत अस्वस्थ',
    hazardous: 'खतरनाक',
  },
  te: {
    good: 'మంచిది',
    moderate: 'మధ్యస్థం',
    sensitive: 'సున్నితమైన వర్గాలకు అనారోగ్యకరం',
    unhealthy: 'అనారోగ్యకరం',
    veryUnhealthy: 'చాలా అనారోగ్యకరం',
    hazardous: 'ప్రమాదకరం',
  },
};

export const US_BAND_LABELS: Record<Language, Record<UsBand, string>> = {
  en: {
    good: 'Good',
    moderate: 'Moderate',
    usg: 'Unhealthy for sensitive groups',
    unhealthy: 'Unhealthy',
    veryUnhealthy: 'Very unhealthy',
    hazardous: 'Hazardous',
  },
  hi: {
    good: 'अच्छा',
    moderate: 'मध्यम',
    usg: 'संवेदनशील समूहों के लिए अस्वस्थ',
    unhealthy: 'अस्वस्थ',
    veryUnhealthy: 'बहुत अस्वस्थ',
    hazardous: 'खतरनाक',
  },
  te: {
    good: 'మంచిది',
    moderate: 'మధ్యస్థం',
    usg: 'సున్నితమైన వర్గాలకు అనారోగ్యకరం',
    unhealthy: 'అనారోగ్యకరం',
    veryUnhealthy: 'చాలా అనారోగ్యకరం',
    hazardous: 'ప్రమాదకరం',
  },
};

export const NAQI_LABELS: Record<Language, Record<NaqiBand, string>> = {
  en: {
    good: 'Good',
    satisfactory: 'Satisfactory',
    moderate: 'Moderate',
    poor: 'Poor',
    veryPoor: 'Very poor',
    severe: 'Severe',
  },
  hi: {
    good: 'अच्छा',
    satisfactory: 'संतोषजनक',
    moderate: 'मध्यम',
    poor: 'खराब',
    veryPoor: 'बहुत खराब',
    severe: 'गंभीर',
  },
  te: {
    good: 'మంచిది',
    satisfactory: 'సంతృప్తికరం',
    moderate: 'మధ్యస్థం',
    poor: 'పేలవం',
    veryPoor: 'చాలా పేలవం',
    severe: 'తీవ్రం',
  },
};

/** Human-readable reason for a fallback plan, localised. */
export function fallbackReasonLabel(language: Language, reason: string): string {
  const table: Record<string, Record<Language, string>> = {
    llm_disabled: { en: 'AI is switched off', hi: 'AI बंद है', te: 'AI ఆఫ్‌లో ఉంది' },
    no_api_key: { en: 'No AI key configured', hi: 'AI कुंजी नहीं है', te: 'AI కీ లేదు' },
    timeout: {
      en: 'AI timed out',
      hi: 'AI समय पर जवाब नहीं दिया',
      te: 'AI సమయానికి స్పందించలేదు',
    },
    upstream_error: { en: 'AI service error', hi: 'AI सेवा त्रुटि', te: 'AI సేవ లోపం' },
    invalid_output: {
      en: 'AI output failed validation',
      hi: 'AI आउटपुट मान्य नहीं था',
      te: 'AI అవుట్‌పుట్ చెల్లదు',
    },
    medical_content: {
      en: 'AI output contained medical advice',
      hi: 'AI आउटपुट में चिकित्सा सलाह थी',
      te: 'AI అవుట్‌పుట్‌లో వైద్య సలహా ఉంది',
    },
    lang_mismatch: {
      en: 'AI output was in the wrong script',
      hi: 'AI आउटपुट गलत लिपि में था',
      te: 'AI అవుట్‌పుట్ తప్పు లిపిలో ఉంది',
    },
    daily_cap: {
      en: 'Daily AI limit reached',
      hi: 'दैनिक AI सीमा पूरी',
      te: 'రోజువారీ AI పరిమితి చేరింది',
    },
    quota_unavailable: {
      en: 'Usage accounting unavailable',
      hi: 'उपयोग गणना उपलब्ध नहीं',
      te: 'వినియోగ లెక్కింపు అందుబాటులో లేదు',
    },
    rate_limited: { en: 'Too many requests', hi: 'बहुत अनुरोध', te: 'అధిక అభ్యర్థనలు' },
    limiter_unavailable: {
      en: 'Request protection is temporarily unavailable, so the AI plan is off',
      hi: 'अनुरोध सुरक्षा अभी उपलब्ध नहीं, इसलिए AI योजना बंद है',
      te: 'అభ్యర్థన రక్షణ ప్రస్తుతం అందుబాటులో లేదు, కాబట్టి AI ప్రణాళిక ఆఫ్‌లో ఉంది',
    },
    cancelled: {
      en: 'You cancelled the AI request',
      hi: 'आपने AI अनुरोध रद्द किया',
      te: 'మీరు AI అభ్యర్థనను రద్దు చేశారు',
    },
    unknown: { en: 'Unexpected error', hi: 'अप्रत्याशित त्रुटि', te: 'అనూహ్య లోపం' },
  };
  return table[reason]?.[language] ?? table.unknown?.[language] ?? reason;
}
