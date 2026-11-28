import type { Language } from '@/lib/shared/types';

/**
 * Local, deterministic regional context.
 *
 * Why it is local: the model never receives a place name, a city or a
 * coordinate, so no regional context is sent to it either. The layer maps the
 * already-rounded coordinates to a coarse region and the calendar month to a
 * season using a static table, entirely in the browser (or in a unit test). It
 * only ever adds general guidance, always labelled as an estimate with its
 * assumption, and never a reading for a specific street.
 *
 * The region ids are deliberately coarse: they exist to pick reviewed copy, not
 * to identify a place.
 */

export type RegionId = 'north' | 'west' | 'east' | 'south' | 'central' | 'other';
export type Season = 'winter' | 'preMonsoon' | 'monsoon' | 'postMonsoon';
type HeatingFuel = 'biomass' | 'lpg' | 'electric' | 'mixed' | 'unknown';

export interface RegionalContext {
  region: RegionId;
  season: Season;
  /** Late-October to November residue-burning window in the north/west. */
  cropBurningSeason: boolean;
  /** December–January, when cold nights trap pollution near the ground. */
  inversionLikely: boolean;
  /** Typical winter heating fuel in the coarse region. */
  heatingFuel: HeatingFuel;
  /** Localised guidance, each phrased as general regional context. */
  notes: string[];
}

const LANGUAGE_NOTE: Record<Language, { regional: string; assumption: string }> = {
  en: {
    regional: 'Regional context',
    assumption: 'General regional guidance, not a measurement for your street.',
  },
  hi: {
    regional: 'क्षेत्रीय संदर्भ',
    assumption: 'सामान्य क्षेत्रीय मार्गदर्शन, आपकी गली का माप नहीं।',
  },
  te: {
    regional: 'ప్రాంతీయ సందర్భం',
    assumption: 'సాధారణ ప్రాంతీయ మార్గదర్శనం, మీ వీధి కొలత కాదు.',
  },
};

/** Coarse bounding boxes over South Asia. Coordinates only, never a name. */
/** True when the rounded point lies inside the South Asia bounding box. */
function inSouthAsia(lat: number, lon: number): boolean {
  return lat >= 5 && lat <= 37 && lon >= 60 && lon <= 98;
}

export function coarseRegion(lat: number, lon: number): RegionId {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return 'other';
  if (!inSouthAsia(lat, lon)) return 'other';
  if (lat >= 23) return 'north';
  if (lon >= 88) return 'east';
  if (lat < 15) return 'south';
  if (lon < 76) return 'west';
  return 'central';
}

/** Meteorological season for the South Asian calendar. */
export function seasonFor(month: number): Season {
  if (month === 11 || month === 0 || month === 1) return 'winter';
  if (month >= 2 && month <= 4) return 'preMonsoon';
  if (month >= 5 && month <= 8) return 'monsoon';
  return 'postMonsoon';
}

function heatingFuelFor(region: RegionId): HeatingFuel {
  switch (region) {
    case 'north':
      // Mixed urban heating: electric room heaters alongside some biomass.
      return 'mixed';
    case 'west':
      return 'electric';
    case 'east':
      return 'biomass';
    case 'south':
      return 'electric';
    case 'central':
      return 'mixed';
    case 'other':
      return 'unknown';
  }
}

type NoteKey =
  | 'cropBurning'
  | 'inversion'
  | 'biomassHeating'
  | 'monsoonWashout'
  | 'preMonsoonDust'
  | 'generalWinter';

const NOTES: Record<Language, Record<NoteKey, string>> = {
  en: {
    cropBurning:
      'Late October and November are the residue-burning window in parts of this region, so short spikes can arrive without a change in local traffic. Estimate: this is regional context, not a reading for your street.',
    inversion:
      'December and January often bring cold, still nights that trap pollution near the ground. Expect the cleanest hours to be midday rather than early morning. Estimate: this is general seasonal guidance.',
    biomassHeating:
      'Solid-fuel or mixed winter heating is common here. If anyone heats with wood, coal or waste indoors, that smoke is usually the largest indoor particle source. Estimate: general guidance, based on typical regional practice.',
    monsoonWashout:
      'During the monsoon, rain and better mixing usually lower particle levels. Keep the indoor combustion advice anyway; it matters in every season. Estimate: general seasonal guidance.',
    preMonsoonDust:
      'The pre-monsoon weeks are often the dustiest of the year, so road and construction dust can matter more than combustion. Estimate: general seasonal guidance.',
    generalWinter:
      'Winter air in this region is usually worst in the evening and around dawn. Plan outdoor trips for the middle of the day where you can. Estimate: general seasonal guidance.',
  },
  hi: {
    cropBurning:
      'इस क्षेत्र के कुछ हिस्सों में अक्टूबर के अंत और नवंबर में फ़सल अवशेष जलाए जाते हैं, इसलिए स्थानीय ट्रैफ़िक बदले बिना भी प्रदूषण के छोटे उछाल आ सकते हैं। अनुमान: यह क्षेत्रीय संदर्भ है, आपकी गली का माप नहीं।',
    inversion:
      'दिसंबर और जनवरी में ठंडी, शांत रातें प्रदूषण को ज़मीन के पास रोक देती हैं। सबसे साफ़ समय सुबह जल्दी नहीं, दोपहर होने की संभावना है। अनुमान: सामान्य मौसमी मार्गदर्शन।',
    biomassHeating:
      'यहाँ ठोस ईंधन या मिश्रित सर्दी-तापन आम है। घर के अंदर लकड़ी, कोयला या कचरा जलाने से निकलने वाला धुआँ आमतौर पर भीतरी कणों का सबसे बड़ा स्रोत होता है। अनुमान: सामान्य मार्गदर्शन।',
    monsoonWashout:
      'मानसून में बारिश और बेहतर मिश्रण कणों का स्तर आमतौर पर घटाते हैं। भीतरी दहन की सलाह फिर भी लागू रहती है। अनुमान: सामान्य मौसमी मार्गदर्शन।',
    preMonsoonDust:
      'मानसून से पहले के हफ़्ते अक्सर साल के सबसे धूल भरे होते हैं, इसलिए सड़क और निर्माण की धूल दहन से ज़्यादा मायने रख सकती है। अनुमान: सामान्य मौसमी मार्गदर्शन।',
    generalWinter:
      'इस क्षेत्र की सर्दियों की हवा आमतौर पर शाम और भोर में सबसे खराब होती है। जहाँ संभव हो, बाहर का काम दोपहर में रखें। अनुमान: सामान्य मौसमी मार्गदर्शन।',
  },
  te: {
    cropBurning:
      'ఈ ప్రాంతంలోని కొన్ని భాగాల్లో అక్టోబర్ చివరి, నవంబర్ నెలల్లో పంట అవశేషాలు కాలుతాయి, కాబట్టి స్థానిక ట్రాఫిక్ మారకుండానే చిన్న పెరుగుదల రావచ్చు. అంచనా: ఇది ప్రాంతీయ సందర్భం, మీ వీధి కొలత కాదు.',
    inversion:
      'డిసెంబర్, జనవరిలో చల్లని నిశ్శబ్ద రాత్రులు కాలుష్యాన్ని నేలకు దగ్గరగా నిలిపేస్తాయి. అత్యంత శుభ్రమైన సమయం ఉదయాన్నే కాక మధ్యాహ్నం ఉండొచ్చు. అంచనా: సాధారణ కాలానుగుణ మార్గదర్శనం.',
    biomassHeating:
      'ఇక్కడ ఘన ఇంధనం లేదా మిశ్రమ శీతాకాల తాపన సాధారణం. ఇంట్లో కలప, బొగ్గు లేదా చెత్త కాలిస్తే వచ్చే పొగ సాధారణంగా అతిపెద్ద లోపలి కణాల మూలం. అంచనా: సాధారణ మార్గదర్శనం.',
    monsoonWashout:
      'వర్షాకాలంలో వర్షం, మెరుగైన కలయిక కణాల స్థాయిని తగ్గిస్తాయి. అయినా లోపలి దహన సలహా వర్తిస్తుంది. అంచనా: సాధారణ కాలానుగుణ మార్గదర్శనం.',
    preMonsoonDust:
      'వర్షాకాలానికి ముందు వారాలు సాధారణంగా సంవత్సరంలో అత్యంత దుమ్ముతో ఉంటాయి, కాబట్టి రోడ్డు, నిర్మాణ దుమ్ము దహనం కంటే ముఖ్యమైనది. అంచనా: సాధారణ కాలానుగుణ మార్గదర్శనం.',
    generalWinter:
      'ఈ ప్రాంతంలో శీతాకాల గాలి సాధారణంగా సాయంత్రం, తెల్లవారుజామున అత్యంత దారుణంగా ఉంటుంది. వీలైతే బయటి పనులు మధ్యాహ్నానికి ప్లాన్ చేయండి. అంచనా: సాధారణ కాలానుగుణ మార్గదర్శనం.',
  },
};

/**
 * Region-specific framing (monsoon,
 * stubble burning, festival smoke) for the plan. Assumption: the heuristics
 * are communication aids chosen from the coordinates' country, not a
 * scientific forecast.
 */
type SeasonalNotes = (typeof NOTES)[Language];

/** Stubble burning peaks in the last two weeks of October into November. */
function isCropBurningSeason(region: string, month: number): boolean {
  const inRegion = region === 'north' || region === 'west' || region === 'central';
  return inRegion && (month === 9 || month === 10);
}

/** Winter inversions trap smoke near the ground in the northern plains. */
function isInversionLikely(region: string, month: number): boolean {
  const inRegion = region === 'north' || region === 'central';
  return inRegion && (month === 11 || month === 0);
}

/** Pick the seasonal notes that apply, always leaving at least one. */
function seasonalNotes(
  copy: SeasonalNotes,
  season: RegionalContext['season'],
  heatingFuel: RegionalContext['heatingFuel'],
  flags: { cropBurningSeason: boolean; inversionLikely: boolean },
): string[] {
  const notes: string[] = [];
  if (flags.cropBurningSeason) notes.push(copy.cropBurning);
  if (flags.inversionLikely) notes.push(copy.inversion);
  const solidFuel = heatingFuel === 'biomass' || heatingFuel === 'mixed';
  if (season === 'winter' && solidFuel) notes.push(copy.biomassHeating);
  if (season === 'monsoon') notes.push(copy.monsoonWashout);
  if (season === 'preMonsoon') notes.push(copy.preMonsoonDust);
  if (notes.length === 0) notes.push(copy.generalWinter);
  return notes;
}

/**
 * Coarse regional context for rounded coordinates and a date.
 *
 * @param lat Rounded latitude; never sent anywhere.
 * @param lon Rounded longitude; never sent anywhere.
 * @param date Date whose UTC month selects the season.
 * @param language Reader's language for the notes.
 * @returns The region, season, flags and the localised notes.
 */
export function regionalContext(
  lat: number,
  lon: number,
  date: Date,
  language: Language,
): RegionalContext {
  const region = coarseRegion(lat, lon);
  const month = date.getUTCMonth();
  const season = seasonFor(month);
  const cropBurningSeason = isCropBurningSeason(region, month);
  const inversionLikely = isInversionLikely(region, month);
  const heatingFuel = heatingFuelFor(region);
  const notes = seasonalNotes(NOTES[language], season, heatingFuel, {
    cropBurningSeason,
    inversionLikely,
  });

  return { region, season, cropBurningSeason, inversionLikely, heatingFuel, notes };
}

/** Label pair for the UI, so the estimate wording cannot drift. */
export function regionalLabels(language: Language): {
  title: string;
  assumption: string;
} {
  return {
    title: LANGUAGE_NOTE[language].regional,
    assumption: LANGUAGE_NOTE[language].assumption,
  };
}
