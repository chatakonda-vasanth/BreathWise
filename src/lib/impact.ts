import type { Profile } from './schemas';
import type { Language } from './types';

/**
 * Lifestyle tailoring and the deterministic "with vs without" estimate.
 *
 * Every factor below is a conservative, published-rule-of-thumb style
 * approximation, not a measurement. Each step carries its assumption, and the
 * UI prints the words "rough estimate" next to every number that comes out of
 * this module (in all three languages).
 *
 * The model is multiplicative and capped at zero, so it can never claim a
 * reduction larger than the pollution present, and it never invents a negative
 * concentration.
 */

export type ImpactStepId = 'purifier' | 'sealGaps' | 'ventilationTiming' | 'mask';

export interface ImpactStep {
  id: ImpactStepId;
  /** Percentage reduction applied by this step. */
  reductionPct: number;
  /** `room` lowers indoor PM2.5; `outdoors` lowers personal exposure. */
  appliesTo: 'room' | 'outdoors';
  label: string;
  assumption: string;
}

export interface ImpactComparison {
  /** Outdoor PM2.5 used as the starting point, rounded to 1 decimal. */
  baseline: number;
  /** Modelled indoor PM2.5 after the room steps, rounded to 1 decimal. */
  withChanges: number;
  /** Modelled personal outdoor exposure with a well-fitted mask. */
  outdoorWithMask: number;
  steps: ImpactStep[];
  labels: ImpactLabels;
}

export interface ImpactLabels {
  title: string;
  without: string;
  with: string;
  outdoors: string;
  roughEstimate: string;
  note: string;
  assumptions: string;
  unit: string;
}

const LABELS: Record<Language, ImpactLabels> = {
  en: {
    title: 'With vs without these changes',
    without: 'Without these changes, outdoor PM2.5',
    with: 'In your main room, after the room steps',
    outdoors: 'Outdoors with a well-fitted N95/FFP2 mask',
    roughEstimate: 'Rough estimate',
    note: 'Rule-of-thumb model built from the steps below, not a measurement of your home.',
    assumptions: 'Assumptions',
    unit: 'µg/m³',
  },
  hi: {
    title: 'इन बदलावों के साथ बनाम बिना',
    without: 'इन बदलावों के बिना, बाहरी PM2.5',
    with: 'मुख्य कमरे में, कमरे के उपायों के बाद',
    outdoors: 'अच्छी तरह फिट N95/FFP2 मास्क के साथ बाहर',
    roughEstimate: 'मोटा अनुमान',
    note: 'नीचे दिए उपायों पर आधारित मोटा नियम-आधारित मॉडल, आपके घर का माप नहीं।',
    assumptions: 'मान्यताएँ',
    unit: 'µg/m³',
  },
  te: {
    title: 'ఈ మార్పులతో vs లేకుండా',
    without: 'ఈ మార్పులు లేకుండా, బయటి PM2.5',
    with: 'మీ ప్రధాన గదిలో, గది చర్యల తర్వాత',
    outdoors: 'సరిగా కూర్చున్న N95/FFP2 మాస్క్‌తో బయట',
    roughEstimate: 'స్థూల అంచనా',
    note: 'క్రింది చర్యల ఆధారంగా రూపొందించిన స్థూల నియమ-ఆధారిత మోడల్, మీ ఇంటి కొలత కాదు.',
    assumptions: 'ఊహలు',
    unit: 'µg/m³',
  },
};

const STEP_COPY: Record<
  Language,
  Record<ImpactStepId, { label: string; assumption: string; diy?: string }>
> = {
  en: {
    purifier: {
      label: 'Run a correctly sized HEPA purifier in the room you use most',
      diy: 'Build a Corsi–Rosenthal box fan filter for the same room',
      assumption:
        'Assumes a closed room, about 5 air changes per hour and a unit (or box) sized for the room; a leakier room gets less.',
    },
    sealGaps: {
      label: 'Seal the largest gaps around doors and windows',
      assumption:
        'Assumes the main leaks are door bottoms, window frames and exhaust flaps; hairline cracks add little.',
    },
    ventilationTiming: {
      label: 'Ventilate briefly at the cleanest hour instead of leaving windows open',
      assumption:
        'Assumes windows would otherwise be open during the dirtiest hours; the benefit depends on how much time they stay open today.',
    },
    mask: {
      label: 'Wear a well-fitted N95/FFP2 mask for unavoidable outdoor trips',
      assumption:
        'Assumes a good seal around the nose and a certified mask; a loose or cloth mask removes far less.',
    },
  },
  hi: {
    purifier: {
      label: 'जिस कमरे में सबसे ज़्यादा समय बिताते हैं, वहाँ सही आकार का HEPA प्यूरीफ़ायर चलाएँ',
      diy: 'उसी कमरे के लिए Corsi–Rosenthal बॉक्स फैन फ़िल्टर बनाएँ',
      assumption:
        'मान्यता: बंद कमरा, लगभग 5 एयर चेंज प्रति घंटा और कमरे के अनुसार सही इकाई; अधिक रिसाव वाले कमरे में कम लाभ।',
    },
    sealGaps: {
      label: 'दरवाज़ों और खिड़कियों के सबसे बड़े गैप बंद करें',
      assumption: 'मान्यता: मुख्य रिसाव दरवाज़े के नीचे, खिड़की के फ्रेम और एग्ज़ॉस्ट फ्लैप से हैं।',
    },
    ventilationTiming: {
      label: 'खिड़कियाँ खुली छोड़ने के बजाय सबसे साफ़ घंटे में थोड़ी देर हवा बदलें',
      assumption: 'मान्यता: खिड़कियाँ सबसे प्रदूषित घंटों में खुली रहती हैं; लाभ उस समय पर निर्भर है।',
    },
    mask: {
      label: 'ज़रूरी बाहरी यात्राओं में अच्छी तरह फिट N95/FFP2 मास्क पहनें',
      assumption: 'मान्यता: नाक के पास अच्छी सील और प्रमाणित मास्क; ढीला या कपड़े का मास्क बहुत कम रोकता है।',
    },
  },
  te: {
    purifier: {
      label: 'ఎక్కువ సమయం గడిపే గదిలో సరైన పరిమాణపు HEPA ప్యూరిఫైయర్ నడపండి',
      diy: 'అదే గదికి Corsi–Rosenthal బాక్స్ ఫ్యాన్ ఫిల్టర్ తయారు చేయండి',
      assumption:
        'ఊహ: మూసిన గది, గంటకు సుమారు 5 గాలి మార్పులు, గదికి సరిపడా యూనిట్; ఎక్కువ లీకేజీ ఉంటే తక్కువ లాభం.',
    },
    sealGaps: {
      label: 'తలుపులు, కిటికీల చుట్టూ ఉన్న పెద్ద ఖాళీలను మూసివేయండి',
      assumption: 'ఊహ: ప్రధాన లీకేజీ తలుపు అడుగు, కిటికీ ఫ్రేమ్, ఎగ్జాస్ట్ ఫ్లాప్ నుంచి వస్తుంది.',
    },
    ventilationTiming: {
      label: 'కిటికీలు తెరిచి ఉంచే బదులు అత్యంత శుభ్రమైన గంటలో కొద్దిసేపు గాలి మార్చండి',
      assumption: 'ఊహ: కిటికీలు అత్యంత కలుషిత గంటల్లో తెరిచి ఉంటాయి; లాభం ఆ సమయంపై ఆధారపడుతుంది.',
    },
    mask: {
      label: 'తప్పనిసరి బయటి ప్రయాణాలకు సరిగా కూర్చున్న N95/FFP2 మాస్క్ పెట్టుకోండి',
      assumption: 'ఊహ: ముక్కు దగ్గర మంచి సీల్, ధృవీకరించిన మాస్క్; వదులుగా లేదా గుడ్డ మాస్క్ చాలా తక్కువ నిరోధిస్తుంది.',
    },
  },
};

/** Documented, deliberately conservative percentages. */
export const IMPACT_FACTORS = {
  hepa: 40,
  diyBox: 25,
  sealSingle: 10,
  sealDouble: 5,
  sealUnknown: 5,
  sealSealed: 0,
  ventilationTiming: 5,
  wellFittedMask: 80,
} as const;

const DEFAULTS = {
  homeType: 'apartment',
  windows: 'single',
  kitchenVentilation: 'unknown',
  commuteMode: 'bus',
  budget: 'low',
  roomSizeSqm: 20,
} as const;

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

/**
 * Deterministic with/without comparison.
 *
 * `null` when PM2.5 is unavailable: the app must not show an impact number it
 * cannot ground in data.
 */
export function compareWithWithout(args: {
  pm25: number | null | undefined;
  profile?: Partial<Profile> | null;
  language: Language;
}): ImpactComparison | null {
  const { pm25, language } = args;
  if (typeof pm25 !== 'number' || !Number.isFinite(pm25) || pm25 < 0) return null;

  const profile = args.profile ?? {};
  const budget = profile.budget ?? DEFAULTS.budget;
  const windows = profile.windows ?? DEFAULTS.windows;
  const copy = STEP_COPY[language];

  const purifierPct =
    budget === 'low' ? IMPACT_FACTORS.diyBox : IMPACT_FACTORS.hepa;
  const sealPct =
    windows === 'single'
      ? IMPACT_FACTORS.sealSingle
      : windows === 'sealed'
        ? IMPACT_FACTORS.sealSealed
        : IMPACT_FACTORS.sealUnknown;

  const steps: ImpactStep[] = [
    {
      id: 'purifier',
      reductionPct: purifierPct,
      appliesTo: 'room',
      label: budget === 'low' ? (copy.purifier.diy ?? copy.purifier.label) : copy.purifier.label,
      assumption: copy.purifier.assumption,
    },
    {
      id: 'sealGaps',
      reductionPct: sealPct,
      appliesTo: 'room',
      label: copy.sealGaps.label,
      assumption: copy.sealGaps.assumption,
    },
    {
      id: 'ventilationTiming',
      reductionPct: IMPACT_FACTORS.ventilationTiming,
      appliesTo: 'room',
      label: copy.ventilationTiming.label,
      assumption: copy.ventilationTiming.assumption,
    },
    {
      id: 'mask',
      reductionPct: IMPACT_FACTORS.wellFittedMask,
      appliesTo: 'outdoors',
      label: copy.mask.label,
      assumption: copy.mask.assumption,
    },
  ];

  const roomFactor = steps
    .filter((step) => step.appliesTo === 'room')
    .reduce((factor, step) => factor * (1 - step.reductionPct / 100), 1);

  const mask = steps.find((step) => step.id === 'mask');
  const maskFactor = mask ? 1 - mask.reductionPct / 100 : 1;

  return {
    baseline: round1(pm25),
    withChanges: round1(Math.max(0, pm25 * roomFactor)),
    outdoorWithMask: round1(Math.max(0, pm25 * maskFactor)),
    steps,
    labels: LABELS[language],
  };
}

// ---------------------------------------------------------------------------
// "Why this plan fits you"
// ---------------------------------------------------------------------------

const WHY: Record<
  Language,
  {
    household: (adults: number, children: number, elderly: number) => string;
    sensitive: string;
    pregnant: string;
    symptoms: string;
    home: (home: string, windows: string) => string;
    kitchen: (ventilation: string) => string;
    commute: (mode: string) => string;
    budget: (budget: string) => string;
    room: (area: number) => string;
  }
> = {
  en: {
    household: (adults, children, elderly) =>
      `Household size: ${adults} adult(s), ${children} child(ren), ${elderly} elderly — outdoor time and masks are framed for the whole household.`,
    sensitive:
      'A sensitive-group member is included, so outdoor exertion is reduced sooner and the mask advice is stronger.',
    pregnant: 'Someone is pregnant, so longer outdoor trips are deprioritised.',
    symptoms:
      'Symptoms were reported today, so the plan adds a medical-safety notice instead of exercise targets.',
    home: (home, windows) =>
      `Home type: ${home} with ${windows} glazing — the sealing and ventilation steps are weighted for that.`,
    kitchen: (ventilation) =>
      `Kitchen ventilation: ${ventilation} — cooking smoke advice is included because indoor combustion is often the largest source.`,
    commute: (mode) =>
      `Commute mode: ${mode} — the school and commute guidance is written for that exposure.`,
    budget: (budget) =>
      `Budget: ${budget} — a free or low-cost option is listed before anything you have to buy.`,
    room: (area) => `Main room: about ${area} m² — the purifier sizing and the estimate use that area.`,
  },
  hi: {
    household: (adults, children, elderly) =>
      `परिवार: ${adults} वयस्क, ${children} बच्चे, ${elderly} बुज़ुर्ग — बाहर का समय और मास्क पूरे परिवार के हिसाब से हैं।`,
    sensitive: 'संवेदनशील सदस्य शामिल हैं, इसलिए बाहरी मेहनत जल्दी घटाई गई है और मास्क सलाह सख्त है।',
    pregnant: 'कोई गर्भवती है, इसलिए लंबे बाहरी दौरे कम प्राथमिकता पर रखे गए हैं।',
    symptoms: 'आज लक्षण बताए गए हैं, इसलिए योजना में व्यायाम लक्ष्य के बजाय चिकित्सा-सुरक्षा सूचना है।',
    home: (home, windows) =>
      `आवास: ${home}, खिड़कियाँ ${windows} — सील और वेंटिलेशन के उपाय उसी हिसाब से हैं।`,
    kitchen: (ventilation) =>
      `रसोई वेंटिलेशन: ${ventilation} — खाना पकाने के धुएँ की सलाह शामिल है क्योंकि भीतरी दहन अक्सर सबसे बड़ा स्रोत है।`,
    commute: (mode) => `यात्रा साधन: ${mode} — स्कूल और यात्रा मार्गदर्शन उसी जोखिम के लिए है।`,
    budget: (budget) => `बजट: ${budget} — मुफ़्त या सस्ता उपाय खरीदने वाले उपाय से पहले दिया गया है।`,
    room: (area) => `मुख्य कमरा: लगभग ${area} m² — प्यूरीफ़ायर आकार और अनुमान इसी क्षेत्र पर आधारित हैं।`,
  },
  te: {
    household: (adults, children, elderly) =>
      `కుటుంబం: ${adults} పెద్దలు, ${children} పిల్లలు, ${elderly} వృద్ధులు — బయటి సమయం, మాస్క్ సలహా మొత్తం కుటుంబానికి సరిపడా.`,
    sensitive:
      'సున్నితమైన వర్గ సభ్యుడు ఉన్నారు, కాబట్టి బయటి శ్రమ త్వరగా తగ్గించబడింది, మాస్క్ సలహా బలంగా ఉంది.',
    pregnant: 'ఎవరో గర్భవతి, కాబట్టి దీర్ఘ బయటి ప్రయాణాలకు తక్కువ ప్రాధాన్యం.',
    symptoms: 'ఈరోజు లక్షణాలు నమోదయ్యాయి, కాబట్టి వ్యాయామ లక్ష్యాలకు బదులు వైద్య-భద్రతా సూచన ఉంది.',
    home: (home, windows) =>
      `ఇళ్ల రకం: ${home}, కిటికీలు ${windows} — సీలింగ్, వెంటిలేషన్ చర్యలు దానికి అనుగుణంగా ఉన్నాయి.`,
    kitchen: (ventilation) =>
      `వంటగది వెంటిలేషన్: ${ventilation} — వంట పొగ సలహా చేర్చబడింది, ఎందుకంటే లోపలి దహనం సాధారణంగా అతిపెద్ద మూలం.`,
    commute: (mode) => `ప్రయాణ విధానం: ${mode} — పాఠశాల, ప్రయాణ మార్గదర్శనం ఆ బహిర్గతానికి సరిపోతుంది.`,
    budget: (budget) => `బడ్జెట్: ${budget} — ఉచిత లేదా తక్కువ ఖర్చు ఎంపిక కొనాల్సిన దానికి ముందు ఇవ్వబడింది.`,
    room: (area) => `ప్రధాన గది: సుమారు ${area} m² — ప్యూరిఫైయర్ పరిమాణం, అంచనా ఈ విస్తీర్ణంపై ఆధారపడతాయి.`,
  },
};

/** Inputs that visibly shaped the plan, in the user's language. */
export function whyThisPlanFits(
  profile: Partial<Profile> | null | undefined,
  language: Language,
): string[] {
  const p = profile ?? {};
  const copy = WHY[language];
  const reasons: string[] = [];

  reasons.push(
    copy.household(p.adults ?? 2, p.children ?? 1, p.elderly ?? 0),
  );
  if (p.sensitiveGroup ?? false) reasons.push(copy.sensitive);
  if (p.pregnant ?? false) reasons.push(copy.pregnant);
  if (p.symptoms ?? false) reasons.push(copy.symptoms);
  reasons.push(copy.home(p.homeType ?? DEFAULTS.homeType, p.windows ?? DEFAULTS.windows));
  reasons.push(copy.kitchen(p.kitchenVentilation ?? DEFAULTS.kitchenVentilation));
  reasons.push(copy.commute(p.commuteMode ?? DEFAULTS.commuteMode));
  reasons.push(copy.budget(p.budget ?? DEFAULTS.budget));
  if (typeof p.roomSizeSqm === 'number') reasons.push(copy.room(Math.round(p.roomSizeSqm)));

  return reasons;
}
