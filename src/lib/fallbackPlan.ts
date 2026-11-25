import { cigaretteEquivalent } from './aqi';
import { BAND_COPY, INDOOR_ITEMS, SUSTAINABLE_ITEMS, hepaCadr } from './planContent';
import type { Profile } from './schemas';
import type { AirSnapshot, Language, Plan, Recommendation, SeverityBand } from './types';

/**
 * Deterministic rule-based plan. Used whenever the model is disabled,
 * unreachable, over quota, timed out or returned something we reject, so the
 * product never depends on a third party to give safe basic guidance.
 */

export type FallbackReason =
  | 'llm_disabled'
  | 'no_api_key'
  | 'timeout'
  | 'upstream_error'
  | 'invalid_output'
  | 'medical_content'
  | 'lang_mismatch'
  | 'daily_cap'
  | 'quota_unavailable'
  | 'rate_limited'
  /** No shared rate limiter is available, so the paid path is switched off. */
  | 'limiter_unavailable'
  /** The user cancelled a slow request; the browser builds this plan itself. */
  | 'cancelled'
  | 'unknown';

const CIGARETTE_ASSUMPTION: Record<Language, string> = {
  en: 'Assumes about 22 µg/m³ of outdoor PM2.5 equals one cigarette a day. This is a rough public-communication approximation, not a medical measurement of your intake.',
  hi: 'मान्यता: लगभग 22 µg/m³ बाहरी PM2.5 को प्रतिदिन एक सिगरेट के बराबर माना गया है। यह मोटा अनुमान है, आपके सेवन का चिकित्सकीय माप नहीं।',
  te: 'ఊహ: సుమారు 22 µg/m³ బయటి PM2.5 రోజుకు ఒక సిగరెట్‌కు సమానం. ఇది సుమారు అంచనా, మీ సేవనానికి వైద్య కొలత కాదు.',
};

const NO_PM25: Record<Language, string> = {
  en: 'PM2.5 is not available for this location right now, so no cigarette-equivalent is calculated.',
  hi: 'इस स्थान के लिए अभी PM2.5 उपलब्ध नहीं है, इसलिए सिगरेट-समतुल्य की गणना नहीं की गई।',
  te: 'ఈ ప్రాంతానికి ఇప్పుడు PM2.5 అందుబాటులో లేదు, కాబట్టి సిగరెట్ సమానం లెక్కించబడలేదు.',
};

const MEDICAL_ALERTS: Record<Language, Record<'hazardous' | 'symptoms', string>> = {
  en: {
    hazardous:
      'Air quality is in the severe/hazardous band. This is general guidance, not medical advice: contact a doctor if anyone has chest pain, severe breathlessness, wheezing that is not settling, or confusion. In an emergency call your local emergency number.',
    symptoms:
      'Someone in the household has symptoms today. This is general guidance, not medical advice: speak to a doctor or your local health worker, especially for a child, an elderly person or anyone who is pregnant.',
  },
  hi: {
    hazardous:
      'हवा गंभीर/खतरनाक श्रेणी में है। यह सामान्य मार्गदर्शन है, चिकित्सा सलाह नहीं: सीने में दर्द, तेज़ सांस फूलना, लगातार घरघराहट या भ्रम हो तो डॉक्टर से मिलें। आपात स्थिति में स्थानीय आपात नंबर पर कॉल करें।',
    symptoms:
      'आज घर में किसी को लक्षण हैं। यह सामान्य मार्गदर्शन है, चिकित्सा सलाह नहीं: बच्चे, बुज़ुर्ग या गर्भवती के लिए डॉक्टर या स्थानीय स्वास्थ्य कार्यकर्ता से बात करें।',
  },
  te: {
    hazardous:
      'గాలి తీవ్రం/ప్రమాదకర శ్రేణిలో ఉంది. ఇది సాధారణ మార్గదర్శనం, వైద్య సలహా కాదు: ఛాతీ నొప్పి, తీవ్ర ఆయాసం, తగ్గని వీజింగ్ లేదా గందరగోళం ఉంటే వైద్యుడిని కలవండి. అత్యవసర సమయంలో స్థానిక అత్యవసర నంబర్‌కు కాల్ చేయండి.',
    symptoms:
      'ఈరోజు ఇంట్లో ఒకరికి లక్షణాలు ఉన్నాయి. ఇది సాధారణ మార్గదర్శనం, వైద్య సలహా కాదు: పిల్లలు, వృద్ధులు లేదా గర్భవతి విషయంలో వైద్యుడిని లేదా స్థానిక ఆరోగ్య కార్యకర్తను సంప్రదించండి.',
  },
};

const PURIFIER_TEXT: Record<Language, (cadr: number, area: number) => string> = {
  en: (cadr, area) =>
    `For a ${area} m² room, look for a purifier rated at about ${cadr} m³/h CADR (or higher). Check the CADR figure on the box rather than the room-size marketing claim.`,
  hi: (cadr, area) =>
    `${area} m² कमरे के लिए लगभग ${cadr} m³/h CADR (या अधिक) वाला प्यूरीफ़ायर देखें। डिब्बे पर लिखा CADR आंकड़ा देखें, विज्ञापन का कमरा-आकार दावा नहीं।`,
  te: (cadr, area) =>
    `${area} m² గదికి సుమారు ${cadr} m³/h CADR (లేదా ఎక్కువ) ఉన్న ప్యూరిఫైయర్ చూడండి. పెట్టెపై ఉన్న CADR సంఖ్యను చూడండి, ప్రకటన గది-పరిమాణ దావా కాదు.`,
};

const PURIFIER_IMPACT: Record<
  Language,
  { mechanism: string; reduction: string; assumption: string }
> = {
  en: {
    mechanism:
      'A HEPA filter with enough clean-air delivery rate turns the room air over several times an hour, removing fine particles that leaked in.',
    reduction:
      'A correctly sized unit in a closed room can cut indoor PM2.5 substantially; the exact share depends on leakage and outdoor levels.',
    assumption:
      'Assumes a closed room, 5 air changes per hour and a 2.4 m ceiling; a bigger or leakier room needs more CADR.',
  },
  hi: {
    mechanism:
      'पर्याप्त CADR वाला HEPA फ़िल्टर कमरे की हवा को घंटे में कई बार घुमाता है और अंदर आए महीन कण हटाता है।',
    reduction:
      'बंद कमरे में सही आकार की इकाई भीतरी PM2.5 काफ़ी घटा सकती है; सटीक हिस्सा रिसाव और बाहरी स्तर पर निर्भर है।',
    assumption:
      'मान्यता: बंद कमरा, प्रति घंटे 5 एयर चेंज, 2.4 मीटर छत; बड़े या अधिक रिसाव वाले कमरे को अधिक CADR चाहिए।',
  },
  te: {
    mechanism:
      'సరిపడా CADR ఉన్న HEPA ఫిల్టర్ గది గాలిని గంటకు అనేకసార్లు తిప్పి, లోపలికి వచ్చిన సూక్ష్మ కణాలను తొలగిస్తుంది.',
    reduction:
      'మూసిన గదిలో సరైన పరిమాణ యూనిట్ లోపలి PM2.5ను గణనీయంగా తగ్గించగలదు; ఖచ్చితమైన వాటా లీకేజీ, బయటి స్థాయిలపై ఆధారపడుతుంది.',
    assumption:
      'ఊహ: మూసిన గది, గంటకు 5 గాలి మార్పులు, 2.4 మీ పైకప్పు; పెద్ద లేదా ఎక్కువ లీకేజీ ఉన్న గదికి ఎక్కువ CADR కావాలి.',
  },
};

function purifierRecommendation(language: Language, roomSizeSqm: number): Recommendation {
  const cadr = hepaCadr(roomSizeSqm);
  const text = PURIFIER_TEXT[language](cadr, Math.round(roomSizeSqm));
  const impact = PURIFIER_IMPACT[language];
  return {
    title:
      language === 'en'
        ? 'Size a HEPA purifier to the room, not the advert'
        : language === 'hi'
          ? 'प्यूरीफ़ायर कमरे के हिसाब से चुनें, विज्ञापन के हिसाब से नहीं'
          : 'ప్యూరిఫైయర్‌ను ప్రకటన ప్రకారం కాదు, గది ప్రకారం ఎంచుకోండి',
    detail: text,
    impact: {
      mechanism: impact.mechanism,
      estimatedReduction: impact.reduction,
      assumption: impact.assumption,
      confidence: 'Medium',
    },
  };
}

export interface BuildFallbackArgs {
  snapshot: AirSnapshot;
  profile: Profile;
  language: Language;
  severity: SeverityBand;
  naqiBand: string;
  reason?: FallbackReason;
}

export function medicalAlertFor(
  language: Language,
  severity: SeverityBand,
  naqiBand: string,
  symptoms: boolean,
): string | null {
  if (severity === 'hazardous' || naqiBand === 'severe') {
    return MEDICAL_ALERTS[language].hazardous;
  }
  if (symptoms) return MEDICAL_ALERTS[language].symptoms;
  return null;
}

export function buildFallbackPlan(args: BuildFallbackArgs): Plan {
  const { snapshot, profile, language, severity, naqiBand, reason } = args;
  const copy = BAND_COPY[language][severity];

  const indoor: Recommendation[] = INDOOR_ITEMS[language].map((item) => ({
    title: item.title,
    detail: item.detail,
    impact: {
      mechanism: item.mechanism,
      estimatedReduction: item.reduction,
      assumption: item.assumption,
      confidence: item.confidence,
    },
  }));

  if (typeof profile.roomSizeSqm === 'number') {
    indoor.push(purifierRecommendation(language, profile.roomSizeSqm));
  }

  const sustainable: Recommendation[] = SUSTAINABLE_ITEMS[language].map((item) => ({
    title: item.title,
    detail: item.detail,
    impact: {
      mechanism: item.mechanism,
      estimatedReduction: item.reduction,
      assumption: item.assumption,
      confidence: item.confidence,
    },
  }));

  const pm25 = snapshot.current.pm25;
  const cigarettes = typeof pm25 === 'number' ? cigaretteEquivalent(pm25) : null;

  const cigaretteText =
    cigarettes === null
      ? NO_PM25[language]
      : language === 'hi'
        ? `बाहरी PM2.5 लगभग ${Math.round(pm25 as number)} µg/m³ है — मोटे तौर पर प्रतिदिन ${cigarettes} सिगरेट के बराबर।`
        : language === 'te'
          ? `బయటి PM2.5 సుమారు ${Math.round(pm25 as number)} µg/m³ — స్థూలంగా రోజుకు ${cigarettes} సిగరెట్లకు సమానం.`
          : `Outdoor PM2.5 is about ${Math.round(pm25 as number)} µg/m³ — very roughly ${cigarettes} cigarettes a day.`;

  return {
    language,
    severity,
    headline: copy.headline,
    whatThisMeans: {
      text: copy.meaning,
      cigaretteEquivalent: cigaretteText,
      assumption: CIGARETTE_ASSUMPTION[language],
    },
    bestTimeToGoOut: copy.bestTime,
    maskGuidance: copy.mask,
    schoolAndCommute: copy.school,
    exerciseTiming: copy.exercise,
    indoorHacks: indoor,
    sustainableAlternatives: sustainable,
    medicalAlert: medicalAlertFor(language, severity, naqiBand, profile.symptoms),
    generatedBy: 'fallback',
    ...(reason ? { fallbackReason: reason } : {}),
  };
}
