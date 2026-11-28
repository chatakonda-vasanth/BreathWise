import type { Language } from '@/lib/shared/types';
import type { ImpactLabels, ImpactStepId } from './types';

export const LABELS: Record<Language, ImpactLabels> = {
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

export const STEP_COPY: Record<
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
      assumption:
        'मान्यता: नाक के पास अच्छी सील और प्रमाणित मास्क; ढीला या कपड़े का मास्क बहुत कम रोकता है।',
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
      assumption:
        'ఊహ: ముక్కు దగ్గర మంచి సీల్, ధృవీకరించిన మాస్క్; వదులుగా లేదా గుడ్డ మాస్క్ చాలా తక్కువ నిరోధిస్తుంది.',
    },
  },
};

/** Documented, deliberately conservative percentages. */
