import type { Profile } from '@/lib/shared/schemas';
import type { Language } from '@/lib/shared/types';
import { DEFAULTS } from './compare';

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
    room: (area) =>
      `Main room: about ${area} m² — the purifier sizing and the estimate use that area.`,
  },
  hi: {
    household: (adults, children, elderly) =>
      `परिवार: ${adults} वयस्क, ${children} बच्चे, ${elderly} बुज़ुर्ग — बाहर का समय और मास्क पूरे परिवार के हिसाब से हैं।`,
    sensitive:
      'संवेदनशील सदस्य शामिल हैं, इसलिए बाहरी मेहनत जल्दी घटाई गई है और मास्क सलाह सख्त है।',
    pregnant: 'कोई गर्भवती है, इसलिए लंबे बाहरी दौरे कम प्राथमिकता पर रखे गए हैं।',
    symptoms: 'आज लक्षण बताए गए हैं, इसलिए योजना में व्यायाम लक्ष्य के बजाय चिकित्सा-सुरक्षा सूचना है।',
    home: (home, windows) =>
      `आवास: ${home}, खिड़कियाँ ${windows} — सील और वेंटिलेशन के उपाय उसी हिसाब से हैं।`,
    kitchen: (ventilation) =>
      `रसोई वेंटिलेशन: ${ventilation} — खाना पकाने के धुएँ की सलाह शामिल है क्योंकि भीतरी दहन अक्सर सबसे बड़ा स्रोत है।`,
    commute: (mode) => `यात्रा साधन: ${mode} — स्कूल और यात्रा मार्गदर्शन उसी जोखिम के लिए है।`,
    budget: (budget) =>
      `बजट: ${budget} — मुफ़्त या सस्ता उपाय खरीदने वाले उपाय से पहले दिया गया है।`,
    room: (area) =>
      `मुख्य कमरा: लगभग ${area} m² — प्यूरीफ़ायर आकार और अनुमान इसी क्षेत्र पर आधारित हैं।`,
  },
  te: {
    household: (adults, children, elderly) =>
      `కుటుంబం: ${adults} పెద్దలు, ${children} పిల్లలు, ${elderly} వృద్ధులు — బయటి సమయం, మాస్క్ సలహా మొత్తం కుటుంబానికి సరిపడా.`,
    sensitive: 'సున్నితమైన వర్గ సభ్యుడు ఉన్నారు, కాబట్టి బయటి శ్రమ త్వరగా తగ్గించబడింది, మాస్క్ సలహా బలంగా ఉంది.',
    pregnant: 'ఎవరో గర్భవతి, కాబట్టి దీర్ఘ బయటి ప్రయాణాలకు తక్కువ ప్రాధాన్యం.',
    symptoms: 'ఈరోజు లక్షణాలు నమోదయ్యాయి, కాబట్టి వ్యాయామ లక్ష్యాలకు బదులు వైద్య-భద్రతా సూచన ఉంది.',
    home: (home, windows) =>
      `ఇళ్ల రకం: ${home}, కిటికీలు ${windows} — సీలింగ్, వెంటిలేషన్ చర్యలు దానికి అనుగుణంగా ఉన్నాయి.`,
    kitchen: (ventilation) =>
      `వంటగది వెంటిలేషన్: ${ventilation} — వంట పొగ సలహా చేర్చబడింది, ఎందుకంటే లోపలి దహనం సాధారణంగా అతిపెద్ద మూలం.`,
    commute: (mode) => `ప్రయాణ విధానం: ${mode} — పాఠశాల, ప్రయాణ మార్గదర్శనం ఆ బహిర్గతానికి సరిపోతుంది.`,
    budget: (budget) =>
      `బడ్జెట్: ${budget} — ఉచిత లేదా తక్కువ ఖర్చు ఎంపిక కొనాల్సిన దానికి ముందు ఇవ్వబడింది.`,
    room: (area) => `ప్రధాన గది: సుమారు ${area} m² — ప్యూరిఫైయర్ పరిమాణం, అంచనా ఈ విస్తీర్ణంపై ఆధారపడతాయి.`,
  },
};

type WhyCopy = (typeof WHY)[Language];

/** The household lines, which are the only conditional ones. */
function householdReasons(profile: Partial<Profile>, copy: WhyCopy): string[] {
  const reasons = [
    copy.household(profile.adults ?? 2, profile.children ?? 1, profile.elderly ?? 0),
  ];
  if (profile.sensitiveGroup ?? false) reasons.push(copy.sensitive);
  if (profile.pregnant ?? false) reasons.push(copy.pregnant);
  if (profile.symptoms ?? false) reasons.push(copy.symptoms);
  return reasons;
}

/** Inputs that visibly shaped the plan, in the user's language. */
export function whyThisPlanFits(
  profile: Partial<Profile> | null | undefined,
  language: Language,
): string[] {
  const p = profile ?? {};
  const copy = WHY[language];
  const reasons = householdReasons(p, copy);

  reasons.push(copy.home(p.homeType ?? DEFAULTS.homeType, p.windows ?? DEFAULTS.windows));
  reasons.push(copy.kitchen(p.kitchenVentilation ?? DEFAULTS.kitchenVentilation));
  reasons.push(copy.commute(p.commuteMode ?? DEFAULTS.commuteMode));
  reasons.push(copy.budget(p.budget ?? DEFAULTS.budget));
  if (typeof p.roomSizeSqm === 'number')
    reasons.push(copy.room(Math.round(p.roomSizeSqm)));

  return reasons;
}
