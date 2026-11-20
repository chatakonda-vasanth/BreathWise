import type { Language, SeverityBand } from './types';

/**
 * Deterministic, reviewed copy for the rule-based fallback plan.
 * Kept in one place so all three languages stay in step and can be reviewed
 * without reading code.
 */

export interface BandCopy {
  headline: string;
  meaning: string;
  bestTime: string;
  mask: string;
  school: string;
  exercise: string;
}

export interface ItemCopy {
  title: string;
  detail: string;
  mechanism: string;
  reduction: string;
  assumption: string;
  confidence: 'High' | 'Medium' | 'Low';
}

export const BAND_COPY: Record<Language, Record<SeverityBand, BandCopy>> = {
  en: {
    good: {
      headline: 'Clean air today — use it well.',
      meaning:
        'Air quality is in the good band. Outdoor activity is reasonable for almost everyone, and smoky or dusty jobs are best done today rather than on a bad day.',
      bestTime: 'Most of the day is fine. Late morning (about 10:00–12:00) is usually the cleanest.',
      mask: 'No mask is needed outdoors for most people.',
      school: 'Walk or cycle to school where it is safe. Normal routine.',
      exercise: 'Outdoor exercise is fine; keep your usual routine.',
    },
    moderate: {
      headline: 'Mostly acceptable air, with a few dirtier hours.',
      meaning:
        'Air is in the moderate band. Most people are fine, but sensitive family members may notice irritation on the worst hours of the day.',
      bestTime:
        'Check the 24-hour chart and go out in the cleanest window — usually late morning, when the air mixes best.',
      mask: 'Optional for most people; a well-fitting mask helps if you are sensitive.',
      school: 'Walk on quieter side streets rather than along main roads where you can.',
      exercise: 'Moderate outdoor exercise is acceptable; shorten hard sessions if you feel irritation.',
    },
    sensitive: {
      headline: 'Sensitive family members should ease off outdoor time.',
      meaning:
        'This band is unhealthy for sensitive groups. Children, elderly people, pregnant people and anyone with asthma, COPD or a heart condition should reduce long or hard outdoor activity.',
      bestTime:
        'Keep outdoor trips short and go in the cleanest hours shown on the chart — not at the evening peak.',
      mask: 'A well-fitting N95/FFP2 mask helps sensitive people on unavoidable trips outdoors.',
      school: 'Use the shortest route, avoid main-road crossings, and keep the walk calm rather than rushed.',
      exercise: 'Move hard exercise indoors or postpone it; children can play indoors today.',
    },
    unhealthy: {
      headline: 'Everyone should cut down outdoor exposure today.',
      meaning:
        'Air is unhealthy. Everyone may feel effects, and sensitive family members may feel them sooner. Treat outdoor time as something to plan, not default to.',
      bestTime:
        'Only essential trips; pick the cleanest hour on the chart and avoid the evening peak.',
      mask: 'Wear a well-fitting N95/FFP2 mask for any trip outside, and check the seal around the nose.',
      school: 'Take the shortest route with the least traffic; ask the school about indoor play and whether windows stay shut.',
      exercise: 'No outdoor exercise today. Indoor movement with windows closed is safer.',
    },
    veryUnhealthy: {
      headline: 'Serious pollution — plan the day around staying in.',
      meaning:
        'Air is very unhealthy. Everyone should avoid outdoor exertion. Homes leak pollution too, so one cleaned room matters more than usual.',
      bestTime:
        'Avoid going out. If you must, go in the cleanest hour on the chart and keep it under 30 minutes.',
      mask: 'An N95/FFP2 mask is strongly advised for any unavoidable trip outside.',
      school: 'Keep the school run as short as possible, windows up in the vehicle, and ask about indoor break time.',
      exercise: 'Cancel outdoor exercise. Stretch or move indoors with doors and windows closed.',
    },
    hazardous: {
      headline: 'Hazardous air — treat this as an emergency for lungs.',
      meaning:
        'Air is hazardous. Everyone is at risk, and sensitive family members are at serious risk. Stay indoors, keep windows shut, and use a filtered room if you have one.',
      bestTime: 'Do not go outside unless it is essential. Wait for a clear improvement on the chart.',
      mask: 'If you must go out, wear a fitted N95/FFP2 mask for the whole trip — cloth masks do not filter this well.',
      school: 'Keep children home if the school cannot keep them indoors; otherwise arrange the shortest possible trip.',
      exercise: 'No outdoor exercise at all. Rest indoors, away from windows.',
    },
  },
  hi: {
    good: {
      headline: 'आज हवा साफ़ है — इसका फ़ायदा उठाएँ।',
      meaning:
        'हवा की गुणवत्ता अच्छी श्रेणी में है। लगभग सभी के लिए बाहर की गतिविधि ठीक है, और धुआँ या धूल वाले काम आज ही कर लेना बेहतर है।',
      bestTime: 'दिन का अधिकांश समय ठीक है। सुबह 10 से 12 बजे के बीच हवा आमतौर पर सबसे साफ़ रहती है।',
      mask: 'अधिकतर लोगों को बाहर मास्क की ज़रूरत नहीं है।',
      school: 'जहाँ सुरक्षित हो, स्कूल पैदल या साइकिल से जाएँ। सामान्य दिनचर्या।',
      exercise: 'बाहर व्यायाम ठीक है; अपनी सामान्य दिनचर्या रखें।',
    },
    moderate: {
      headline: 'हवा ज़्यादातर ठीक, कुछ घंटे अधिक प्रदूषित।',
      meaning:
        'हवा मध्यम श्रेणी में है। ज़्यादातर लोग ठीक हैं, लेकिन संवेदनशील परिवारजनों को दिन के सबसे खराब घंटों में जलन हो सकती है।',
      bestTime:
        '24 घंटे का चार्ट देखें और सबसे साफ़ समय में बाहर जाएँ — आमतौर पर सुबह के अंत में।',
      mask: 'अधिकतर के लिए वैकल्पिक; संवेदनशील हों तो अच्छी तरह फिट मास्क मदद करता है।',
      school: 'जहाँ संभव हो, मुख्य सड़कों के बजाय शांत गलियों से जाएँ।',
      exercise: 'मध्यम बाहरी व्यायाम ठीक है; जलन हो तो कठिन सत्र छोटा करें।',
    },
    sensitive: {
      headline: 'संवेदनशील सदस्य बाहर का समय घटाएँ।',
      meaning:
        'यह श्रेणी संवेदनशील समूहों के लिए अस्वस्थ है। बच्चे, बुज़ुर्ग, गर्भवती और दमा, सीओपीडी या हृदय रोग वाले लंबी या कठिन बाहरी गतिविधि घटाएँ।',
      bestTime: 'बाहर के दौरे छोटे रखें और चार्ट के सबसे साफ़ घंटों में जाएँ — शाम की चोटी पर नहीं।',
      mask: 'अनिवार्य बाहरी दौरों में अच्छी तरह फिट N95/FFP2 मास्क संवेदनशील लोगों के लिए मददगार है।',
      school: 'सबसे छोटा रास्ता चुनें, मुख्य सड़क पार न करें, और चलने में जल्दबाज़ी न करें।',
      exercise: 'कठिन व्यायाम घर के अंदर करें या टालें; बच्चे आज घर में खेलें।',
    },
    unhealthy: {
      headline: 'आज सभी को बाहर का संपर्क घटाना चाहिए।',
      meaning:
        'हवा अस्वस्थ है। सभी को असर हो सकता है और संवेदनशील सदस्यों को जल्दी। बाहर जाना योजना बनाकर करें, आदत से नहीं।',
      bestTime: 'केवल ज़रूरी दौरे; चार्ट का सबसे साफ़ घंटा चुनें और शाम की चोटी से बचें।',
      mask: 'बाहर हर दौरे में अच्छी तरह फिट N95/FFP2 मास्क पहनें और नाक के पास सील जाँचें।',
      school: 'सबसे कम ट्रैफ़िक वाला सबसे छोटा रास्ता; स्कूल से अंदर खेल और खिड़कियाँ बंद रखने के बारे में पूछें।',
      exercise: 'आज बाहर व्यायाम नहीं। खिड़कियाँ बंद कर घर में हलचल सुरक्षित है।',
    },
    veryUnhealthy: {
      headline: 'गंभीर प्रदूषण — दिन घर के अंदर रहने की योजना बनाएँ।',
      meaning:
        'हवा बहुत अस्वस्थ है। सभी को बाहरी मेहनत से बचना चाहिए। प्रदूषण घर में भी आता है, इसलिए एक साफ़ कमरा आज ज़्यादा मायने रखता है।',
      bestTime: 'बाहर जाने से बचें। ज़रूरी हो तो चार्ट का सबसे साफ़ घंटा चुनें और 30 मिनट से कम रखें।',
      mask: 'अनिवार्य बाहरी यात्रा में N95/FFP2 मास्क अवश्य लगाएँ।',
      school: 'स्कूल दौरा जितना छोटा हो सके रखें, वाहन की खिड़कियाँ बंद रखें, और अंदर ब्रेक के बारे में पूछें।',
      exercise: 'बाहर व्यायाम रद्द करें। दरवाज़े-खिड़कियाँ बंद कर घर में स्ट्रेचिंग करें।',
    },
    hazardous: {
      headline: 'खतरनाक हवा — इसे फेफड़ों के लिए आपात स्थिति मानें।',
      meaning:
        'हवा खतरनाक है। सभी को खतरा है और संवेदनशील सदस्यों को गंभीर खतरा। घर में रहें, खिड़कियाँ बंद रखें, और फ़िल्टर वाला कमरा हो तो उसका उपयोग करें।',
      bestTime: 'ज़रूरी न हो तो बाहर न जाएँ। चार्ट पर स्पष्ट सुधार का इंतज़ार करें।',
      mask: 'अगर बाहर जाना ही हो, पूरे दौरे में फिट N95/FFP2 मास्क पहनें — कपड़े का मास्क पर्याप्त नहीं।',
      school: 'अगर स्कूल बच्चों को अंदर नहीं रख सकता तो उन्हें घर रखें; वरना सबसे छोटा सफ़र तय करें।',
      exercise: 'बाहर व्यायाम बिल्कुल नहीं। खिड़कियों से दूर रहकर घर में आराम करें।',
    },
  },
  te: {
    good: {
      headline: 'ఈరోజు గాలి శుభ్రంగా ఉంది — సద్వినియోగం చేసుకోండి.',
      meaning:
        'గాలి నాణ్యత మంచి శ్రేణిలో ఉంది. దాదాపు అందరికీ బయటి కార్యకలాపాలు సరిపోతాయి; పొగ లేదా దుమ్ము పనులు ఈరోజే చేయడం మంచిది.',
      bestTime: 'రోజులో ఎక్కువ సమయం మంచిదే. ఉదయం 10–12 మధ్య గాలి సాధారణంగా శుభ్రంగా ఉంటుంది.',
      mask: 'చాలామందికి బయట మాస్క్ అవసరం లేదు.',
      school: 'సురక్షితమైతే పాఠశాలకు నడిచి లేదా సైకిల్‌పై వెళ్లండి. మామూలు దినచర్య.',
      exercise: 'బయట వ్యాయామం సరిపోతుంది; మామూలు దినచర్య కొనసాగించండి.',
    },
    moderate: {
      headline: 'గాలి ఎక్కువగా సరిపోతుంది, కొన్ని గంటలు ఎక్కువ కలుషితం.',
      meaning:
        'గాలి మధ్యస్థ శ్రేణిలో ఉంది. చాలామందికి ఇబ్బంది లేదు, కానీ సున్నితమైన కుటుంబ సభ్యులకు రోజులో అత్యంత కలుషిత గంటల్లో మంట అనిపించవచ్చు.',
      bestTime: '24 గంటల చార్ట్ చూసి అత్యంత శుభ్రమైన సమయంలో బయటకు వెళ్లండి — సాధారణంగా ఉదయం చివర.',
      mask: 'చాలామందికి ఐచ్ఛికం; సున్నితమైనవారైతే సరిగా కూర్చున్న మాస్క్ సహాయపడుతుంది.',
      school: 'వీలైతే ప్రధాన రోడ్లకు బదులు నిశ్శబ్ద సందుల్లో నడవండి.',
      exercise: 'మధ్యస్థ బయటి వ్యాయామం సరిపోతుంది; మంట అనిపిస్తే కఠిన సెషన్లు తగ్గించండి.',
    },
    sensitive: {
      headline: 'సున్నితమైన కుటుంబ సభ్యులు బయటి సమయాన్ని తగ్గించాలి.',
      meaning:
        'ఈ శ్రేణి సున్నితమైన వర్గాలకు అనారోగ్యకరం. పిల్లలు, వృద్ధులు, గర్భవతులు, ఆస్తమా, సీఓపీడీ లేదా గుండె సమస్య ఉన్నవారు దీర్ఘమైన లేదా కఠిన బయటి కార్యకలాపాలు తగ్గించాలి.',
      bestTime: 'బయటి ప్రయాణాలు పొట్టిగా ఉంచి, చార్ట్‌లో అత్యంత శుభ్రమైన గంటల్లో వెళ్లండి — సాయంత్రం శిఖరం వద్ద కాదు.',
      mask: 'తప్పనిసరి బయటి ప్రయాణాల్లో సరిగా కూర్చున్న N95/FFP2 మాస్క్ సున్నితమైనవారికి సహాయపడుతుంది.',
      school: 'అత్యంత పొట్టి మార్గం ఎంచుకోండి, ప్రధాన రోడ్లు దాటకండి, నడకలో ఆత్రం వద్దు.',
      exercise: 'కఠిన వ్యాయామం ఇంట్లో చేయండి లేదా వాయిదా వేయండి; పిల్లలు ఈరోజు ఇంట్లో ఆడుకోవచ్చు.',
    },
    unhealthy: {
      headline: 'ఈరోజు అందరూ బయటి సంపర్కాన్ని తగ్గించాలి.',
      meaning:
        'గాలి అనారోగ్యకరం. అందరికీ ప్రభావం ఉండవచ్చు, సున్నితమైన సభ్యులకు త్వరగా. బయటకు వెళ్లడాన్ని అలవాటుగా కాకుండా ప్రణాళికతో చేయండి.',
      bestTime: 'అవసరమైన ప్రయాణాలు మాత్రమే; చార్ట్‌లో అత్యంత శుభ్రమైన గంట ఎంచుకోండి, సాయంత్రం శిఖరం మానండి.',
      mask: 'బయట ప్రతి ప్రయాణంలో సరిగా కూర్చున్న N95/FFP2 మాస్క్ పెట్టుకోండి, ముక్కు దగ్గర సీల్ చూసుకోండి.',
      school: 'అత్యంత తక్కువ ట్రాఫిక్ ఉన్న పొట్టి మార్గం; పాఠశాలలో లోపల ఆట, కిటికీలు మూసి ఉంచడం గురించి అడగండి.',
      exercise: 'ఈరోజు బయట వ్యాయామం వద్దు. కిటికీలు మూసి ఇంట్లో కదలిక సురక్షితం.',
    },
    veryUnhealthy: {
      headline: 'తీవ్రమైన కాలుష్యం — రోజును ఇంట్లో ఉండేలా ప్రణాళిక చేయండి.',
      meaning:
        'గాలి చాలా అనారోగ్యకరం. అందరూ బయటి శ్రమను మానాలి. కాలుష్యం ఇంట్లోకి కూడా వస్తుంది, కాబట్టి ఒక శుభ్రమైన గది ఈరోజు ఎక్కువ ముఖ్యం.',
      bestTime: 'బయటకు వెళ్లకండి. తప్పనిసరైతే చార్ట్‌లో శుభ్రమైన గంటలో 30 నిమిషాల లోపు వెళ్లండి.',
      mask: 'తప్పనిసరి బయటి ప్రయాణానికి N95/FFP2 మాస్క్ తప్పనిసరిగా వాడండి.',
      school: 'పాఠశాల ప్రయాణం వీలైనంత పొట్టిగా, వాహనంలో కిటికీలు మూసి, లోపల విరామం గురించి అడగండి.',
      exercise: 'బయటి వ్యాయామం రద్దు చేయండి. తలుపులు, కిటికీలు మూసి ఇంట్లో స్ట్రెచింగ్ చేయండి.',
    },
    hazardous: {
      headline: 'ప్రమాదకరమైన గాలి — ఇది ఊపిరితిత్తుల అత్యవసర పరిస్థితి.',
      meaning:
        'గాలి ప్రమాదకరం. అందరికీ ప్రమాదం, సున్నితమైన సభ్యులకు తీవ్ర ప్రమాదం. ఇంట్లో ఉండండి, కిటికీలు మూసి ఉంచండి, ఫిల్టర్ గది ఉంటే వాడండి.',
      bestTime: 'అత్యవసరం కాకపోతే బయటకు వెళ్లకండి. చార్ట్‌లో స్పష్టమైన మెరుగుదల కోసం వేచి ఉండండి.',
      mask: 'బయటకు వెళ్లాల్సి వస్తే పూర్తి ప్రయాణంలో సరిగా కూర్చున్న N95/FFP2 మాస్క్ పెట్టుకోండి — గుడ్డ మాస్క్ సరిపోదు.',
      school: 'పాఠశాల పిల్లలను లోపల ఉంచలేకపోతే ఇంట్లో ఉంచండి; లేకపోతే అత్యంత పొట్టి ప్రయాణం ఏర్పాటు చేయండి.',
      exercise: 'బయటి వ్యాయామం అస్సలు వద్దు. కిటికీలకు దూరంగా ఇంట్లో విశ్రాంతి తీసుకోండి.',
    },
  },
};

export const INDOOR_ITEMS: Record<Language, ItemCopy[]> = {
  en: [
    {
      title: 'Ventilate in short bursts, at the cleanest hour',
      detail:
        'Open opposite windows for 10–15 minutes when the chart shows the lowest AQI, then close them. Two or three short bursts beat one long open window on a smoggy day.',
      mechanism:
        'Short cross-ventilation swaps stale indoor air for outdoor air while limiting the total mass of particles that settles indoors.',
      reduction: 'Indoor PM2.5 during the burst rises toward outdoor levels; the rest of the day stays lower than with windows open.',
      assumption: 'Assumes window openings of roughly 1–2 m² and an outdoor PM2.5 at the value shown on the chart.',
      confidence: 'Medium',
    },
    {
      title: 'Close the gaps that leak most',
      detail:
        'Focus on door bottoms, window frames, exhaust fan flaps, and the gap under the main door. Foam tape and a door draught excluder are the cheapest fix.',
      mechanism:
        'Infiltration is driven by pressure differences; sealing the largest apertures cuts the volume of unfiltered outdoor air entering the room.',
      reduction: 'Usually a modest share of total infiltration — the big leaks matter far more than hairline cracks.',
      assumption: 'Assumes a typical apartment with a shared corridor and windows that already close fully.',
      confidence: 'Medium',
    },
    {
      title: 'Cut indoor combustion first',
      detail:
        'Avoid incense, mosquito coils and candle smoke indoors; cook with the chimney or exhaust fan running; if anyone smokes, keep it strictly outdoors and away from windows.',
      mechanism:
        'Incense, coils and cooking produce fine particles indoors directly, where there is no dispersion and no rain to wash them out.',
      reduction: 'Removing one indoor combustion source often matters more indoors than anything done about outdoor air.',
      assumption: 'Assumes daily incense or coil use, which is common in many Indian homes.',
      confidence: 'High',
    },
    {
      title: 'Plants are nice, not a filter',
      detail:
        'Houseplants do not meaningfully clean indoor air at the volumes a room needs. Keep them for comfort, but do not count them as protection.',
      mechanism:
        'Leaf surface area and air contact time in a normal room are orders of magnitude too small for measurable PM2.5 removal.',
      reduction: 'Effectively none for particles at room scale.',
      assumption: 'Based on chamber studies scaled to ordinary room volumes.',
      confidence: 'High',
    },
    {
      title: 'Low-budget DIY: Corsi–Rosenthal box',
      detail:
        'Four MERV-13 (or F7–F9) filters taped into a cube with a box fan on top. Budget roughly one filter set per season, and run it in the room you use most.',
      mechanism:
        'The fan forces room air through filter media, trapping particles; the cube shape gives a large filter area for a low-cost fan.',
      reduction: 'A well-built box can move several hundred m³/h of filtered air, comparable to a mid-size commercial purifier.',
      assumption: 'Assumes a standard 20-inch box fan, four 20-inch MERV-13 filters, and a room of about 20–30 m².',
      confidence: 'Medium',
    },
  ],
  hi: [
    {
      title: 'थोड़ी-थोड़ी देर के लिए, सबसे साफ़ घंटे में हवा बदलें',
      detail:
        'जब चार्ट पर AQI सबसे कम हो, आमने-सामने की खिड़कियाँ 10–15 मिनट खोलें और फिर बंद कर दें। प्रदूषित दिन में दो-तीन छोटी बारिश-खिड़की एक लंबी खुली खिड़की से बेहतर है।',
      mechanism:
        'छोटी क्रॉस-वेंटिलेशन बासी भीतरी हवा को बाहरी हवा से बदलती है, जबकि अंदर बैठने वाले कणों की कुल मात्रा सीमित रहती है।',
      reduction: 'उस दौरान भीतरी PM2.5 बाहर के स्तर की ओर बढ़ता है; बाकी दिन खुली खिड़की से कम रहता है।',
      assumption: 'मान्यता: खिड़की का खुलना लगभग 1–2 m² और बाहरी PM2.5 चार्ट पर दिखाया मान।',
      confidence: 'Medium',
    },
    {
      title: 'सबसे बड़े रिसाव बंद करें',
      detail:
        'दरवाज़े के नीचे, खिड़की के फ्रेम, एग्ज़ॉस्ट फैन के फ्लैप और मुख्य दरवाज़े के नीचे के गैप पर ध्यान दें। फोम टेप और ड्रॉट एक्सक्लूडर सबसे सस्ता उपाय है।',
      mechanism:
        'रिसाव दबाव के अंतर से होता है; सबसे बड़े छिद्र बंद करने से बिना फ़िल्टर वाली बाहरी हवा कम आती है।',
      reduction: 'कुल रिसाव का सामान्य हिस्सा — बड़े छिद्र बाल जैसी दरारों से कहीं अधिक मायने रखते हैं।',
      assumption: 'मान्यता: सामान्य फ्लैट, साझा कॉरिडोर, और खिड़कियाँ पूरी बंद होती हैं।',
      confidence: 'Medium',
    },
    {
      title: 'घर के अंदर का धुआँ पहले कम करें',
      detail:
        'घर में अगरबत्ती, मच्छर कॉइल और मोमबत्ती का धुआँ न करें; चिमनी या एग्ज़ॉस्ट फैन चालू रखकर पकाएँ; कोई धूम्रपान करता है तो केवल बाहर, खिड़कियों से दूर।',
      mechanism:
        'अगरबत्ती, कॉइल और पकाना सीधे घर में महीन कण बनाते हैं, जहाँ न फैलाव है न बारिश से धुलाई।',
      reduction: 'एक भीतरी दहन-स्रोत हटाना अक्सर बाहरी हवा के किसी भी उपाय से ज़्यादा असर करता है।',
      assumption: 'मान्यता: रोज़ अगरबत्ती या कॉइल का उपयोग, जो भारतीय घरों में आम है।',
      confidence: 'High',
    },
    {
      title: 'पौधे अच्छे हैं, फ़िल्टर नहीं',
      detail:
        'घरेलू पौधे कमरे की ज़रूरत जितनी हवा साफ़ नहीं करते। सुंदरता के लिए रखें, लेकिन सुरक्षा न मानें।',
      mechanism:
        'सामान्य कमरे में पत्तियों का क्षेत्रफल और हवा का संपर्क समय मापने योग्य PM2.5 हटाने के लिए बहुत कम है।',
      reduction: 'कमरे के पैमाने पर कणों के लिए व्यावहारिक रूप से शून्य।',
      assumption: 'चैंबर अध्ययनों को सामान्य कमरे के आयतन पर लागू करके।',
      confidence: 'High',
    },
    {
      title: 'कम बजट का DIY: कॉर्सी–रोज़ेंथल बॉक्स',
      detail:
        'चार MERV-13 (या F7–F9) फ़िल्टर टेप से घन बनाकर ऊपर बॉक्स फैन। लगभग एक सीज़न में एक फ़िल्टर सेट, और जिस कमरे में सबसे ज़्यादा रहते हैं वहाँ चलाएँ।',
      mechanism:
        'फैन कमरे की हवा फ़िल्टर से गुज़ारता है और कण फँसते हैं; घन आकार कम लागत के फैन के लिए बड़ा फ़िल्टर क्षेत्र देता है।',
      reduction: 'अच्छी तरह बना बॉक्स कई सौ m³/h हवा साफ़ कर सकता है, मध्यम आकार के प्यूरीफ़ायर जैसा।',
      assumption: 'मान्यता: 20 इंच का सामान्य बॉक्स फैन, चार 20 इंच MERV-13 फ़िल्टर, 20–30 m² का कमरा।',
      confidence: 'Medium',
    },
  ],
  te: [
    {
      title: 'చిన్న చిన్న వ్యవధుల్లో, అత్యంత శుభ్రమైన గంటలో గాలి మార్చండి',
      detail:
        'చార్ట్‌లో AQI అత్యంత తక్కువగా ఉన్నప్పుడు ఎదురుగా ఉన్న కిటికీలు 10–15 నిమిషాలు తెరిచి మూసేయండి. కలుషిత రోజున రెండు-మూడు చిన్న సార్లు ఒక పొడవైన తెరిచిన కిటికీ కంటే మంచిది.',
      mechanism:
        'చిన్న క్రాస్-వెంటిలేషన్ నిలిచిన లోపలి గాలిని బయటి గాలితో మారుస్తుంది, లోపల స్థిరపడే కణాల మొత్తాన్ని పరిమితం చేస్తుంది.',
      reduction: 'ఆ సమయంలో లోపలి PM2.5 బయటి స్థాయికి చేరుకుంటుంది; మిగిలిన రోజు తెరిచిన కిటికీ కంటే తక్కువగా ఉంటుంది.',
      assumption: 'ఊహ: సుమారు 1–2 m² కిటికీ తెరుచుకోవడం, బయటి PM2.5 చార్ట్‌లో చూపిన విలువ.',
      confidence: 'Medium',
    },
    {
      title: 'అతి పెద్ద లీకేజీలను మూయండి',
      detail:
        'తలుపు అడుగు, కిటికీ ఫ్రేమ్, ఎగ్జాస్ట్ ఫ్యాన్ ఫ్లాప్, ప్రధాన తలుపు కింద ఖాళీపై దృష్టి పెట్టండి. ఫోమ్ టేప్, డ్రాఫ్ట్ ఎక్స్‌క్లూడర్ అతి చవకైన పరిష్కారం.',
      mechanism:
        'గాలి లీకేజీ పీడన భేదం వల్ల జరుగుతుంది; అతి పెద్ద రంధ్రాలు మూస్తే ఫిల్టర్ కాని బయటి గాలి తక్కువగా వస్తుంది.',
      reduction: 'మొత్తం లీకేజీలో సాధారణ వాటా — పెద్ద రంధ్రాలు జుట్టు బీటల కంటే చాలా ముఖ్యం.',
      assumption: 'ఊహ: సాధారణ అపార్ట్‌మెంట్, ఉమ్మడి కారిడార్, కిటికీలు పూర్తిగా మూసుకుంటాయి.',
      confidence: 'Medium',
    },
    {
      title: 'ఇంట్లో పొగను ముందుగా తగ్గించండి',
      detail:
        'ఇంట్లో అగరబత్తి, దోమ కాయిల్స్, కొవ్వొత్తి పొగ వద్దు; చిమ్నీ లేదా ఎగ్జాస్ట్ ఫ్యాన్ వేసి వండండి; ఎవరైనా ధూమపానం చేస్తే కేవలం బయట, కిటికీలకు దూరంగా.',
      mechanism:
        'అగరబత్తి, కాయిల్స్, వంట సూటిగా ఇంట్లో సూక్ష్మ కణాలను ఉత్పత్తి చేస్తాయి; అక్కడ చెదరడం, వర్షంతో కడగడం ఉండదు.',
      reduction: 'ఒక లోపలి దహన మూలాన్ని తీసేయడం బయటి గాలి చర్యల కంటే ఎక్కువ ప్రభావం చూపుతుంది.',
      assumption: 'ఊహ: రోజూ అగరబత్తి లేదా కాయిల్ వాడకం, భారతీయ ఇళ్లలో సాధారణం.',
      confidence: 'High',
    },
    {
      title: 'మొక్కలు అందం, ఫిల్టర్ కాదు',
      detail:
        'ఇంటి మొక్కలు గదికి అవసరమైనంత గాలిని శుభ్రం చేయవు. సౌందర్యం కోసం ఉంచండి, కానీ రక్షణగా లెక్కించకండి.',
      mechanism:
        'సాధారణ గదిలో ఆకుల విస్తీర్ణం, గాలి సంపర్క సమయం కొలవగల PM2.5 తొలగింపుకు చాలా తక్కువ.',
      reduction: 'గది స్థాయిలో కణాలపై ఆచరణాత్మకంగా శూన్యం.',
      assumption: 'ఛాంబర్ అధ్యయనాలను సాధారణ గది ఘనపరిమాణానికి అన్వయించడం.',
      confidence: 'High',
    },
    {
      title: 'తక్కువ ఖర్చు DIY: కోర్సీ–రోజెన్‌తాల్ బాక్స్',
      detail:
        'నాలుగు MERV-13 (లేదా F7–F9) ఫిల్టర్లను టేప్‌తో ఘనంగా చేసి పైన బాక్స్ ఫ్యాన్ పెట్టండి. సీజన్‌కు ఒక ఫిల్టర్ సెట్, ఎక్కువగా ఉండే గదిలో నడపండి.',
      mechanism:
        'ఫ్యాన్ గది గాలిని ఫిల్టర్ ద్వారా నెట్టి కణాలను పట్టుకుంటుంది; ఘన ఆకారం తక్కువ ఖర్చు ఫ్యాన్‌కు పెద్ద ఫిల్టర్ వైశాల్యం ఇస్తుంది.',
      reduction: 'బాగా నిర్మించిన బాక్స్ వందల m³/h గాలిని శుభ్రం చేయగలదు, మధ్యస్థ వాణిజ్య ప్యూరిఫైయర్‌కు సమానం.',
      assumption: 'ఊహ: 20 అంగుళాల బాక్స్ ఫ్యాన్, నాలుగు 20 అంగుళాల MERV-13 ఫిల్టర్లు, 20–30 m² గది.',
      confidence: 'Medium',
    },
  ],
};

export const SUSTAINABLE_ITEMS: Record<Language, ItemCopy[]> = {
  en: [
    {
      title: 'Replace short car trips with bus, metro, cycle or walking',
      detail:
        'Aim at the trips under 5 km first — they are the ones where a car is least efficient and the air is dirtiest. Even two car-free days a week helps.',
      mechanism:
        'Exhaust and brake/tyre particles are emitted per kilometre travelled; shifting those kilometres to public transport or muscle power removes them locally.',
      reduction: 'Roughly proportional to the car kilometres avoided; a small car on 10 km emits on the order of 1 kg CO2 and measurable PM.',
      assumption: 'Assumes an average petrol car, typical urban speeds, and that the bus or metro would run anyway.',
      confidence: 'Medium',
    },
    {
      title: 'Never burn waste, leaves or crop residue',
      detail:
        'Burn nothing in the open, including garden waste. Where it is available, cook with LPG or induction rather than biomass, and never burn coal indoors.',
      mechanism:
        'Open burning and solid-fuel cooking release fine particles and black carbon close to where people breathe, with no chimney and no filtering.',
      reduction: 'One small open fire for an hour can dominate a neighbourhood’s hourly PM2.5 more than traffic on that street.',
      assumption: 'Based on emission-factor comparisons per kilogram of fuel or waste burned.',
      confidence: 'High',
    },
    {
      title: 'Choose electric heat and shared solutions',
      detail:
        'Prefer an electric room heater or a heat pump over wood or coal, and organise a shared clean-air room for the neighbourhood during peaks.',
      mechanism:
        'Electric heating moves emissions to a distant power plant with controls, while shared filtered rooms concentrate limited equipment where it helps most.',
      reduction: 'Removes indoor combustion entirely; the grid emissions depend on how the local electricity is generated.',
      assumption: 'Assumes the local grid is not coal-dominated; if it is, the net benefit is smaller but the indoor benefit remains.',
      confidence: 'Medium',
    },
  ],
  hi: [
    {
      title: 'छोटी कार यात्राओं की जगह बस, मेट्रो, साइकिल या पैदल',
      detail:
        'पहले 5 किमी से कम की यात्राएँ चुनें — वहीं कार सबसे कम कुशल होती है और हवा सबसे प्रदूषित। हफ़्ते में दो दिन कार-मुक्त भी मदद करता है।',
      mechanism:
        'निकास और ब्रेक/टायर के कण प्रति किलोमीटर निकलते हैं; वे किलोमीटर सार्वजनिक परिवहन या मांसपेशी-शक्ति में बदलने से स्थानीय रूप से हट जाते हैं।',
      reduction: 'बचाए गए कार किलोमीटर के लगभग अनुपात में; 10 किमी पर छोटी कार लगभग 1 किग्रा CO2 और मापने योग्य PM छोड़ती है।',
      assumption: 'मान्यता: औसत पेट्रोल कार, सामान्य शहरी गति, और बस/मेट्रो वैसे भी चलती।',
      confidence: 'Medium',
    },
    {
      title: 'कचरा, पत्ते या फसल अवशेष कभी न जलाएँ',
      detail:
        'खुले में कुछ न जलाएँ, बगीचे का कचरा भी नहीं। जहाँ उपलब्ध हो, बायोमास के बजाय LPG या इंडक्शन से पकाएँ, और घर में कोयला कभी न जलाएँ।',
      mechanism:
        'खुला जलाना और ठोस ईंधन से पकाना महीन कण और ब्लैक कार्बन उसी जगह छोड़ते हैं जहाँ लोग सांस लेते हैं — न चिमनी, न फ़िल्टर।',
      reduction: 'एक घंटे की छोटी खुली आग उस सड़क के ट्रैफ़िक से ज़्यादा मोहल्ले की प्रति-घंटा PM2.5 तय कर सकती है।',
      assumption: 'प्रति किलो ईंधन या कचरे के उत्सर्जन-कारक तुलना पर आधारित।',
      confidence: 'High',
    },
    {
      title: 'बिजली से गर्मी और साझा समाधान चुनें',
      detail:
        'लकड़ी या कोयले के बजाय इलेक्ट्रिक रूम हीटर या हीट पंप चुनें, और चरम प्रदूषण में मोहल्ले के लिए साझा साफ़-हवा कमरा बनाएँ।',
      mechanism:
        'बिजली से गर्मी उत्सर्जन को नियंत्रित दूर के बिजलीघर में भेजती है, और साझा फ़िल्टर कमरे सीमित उपकरण को सबसे उपयोगी जगह लगाते हैं।',
      reduction: 'घर का दहन पूरी तरह हटता है; ग्रिड उत्सर्जन स्थानीय बिजली उत्पादन पर निर्भर।',
      assumption: 'मान्यता: स्थानीय ग्रिड कोयले पर निर्भर नहीं; अगर है, शुद्ध लाभ कम पर भीतरी लाभ बना रहता है।',
      confidence: 'Medium',
    },
  ],
  te: [
    {
      title: 'చిన్న కారు ప్రయాణాలకు బదులు బస్సు, మెట్రో, సైకిల్ లేదా నడక',
      detail:
        'మొదట 5 కి.మీ లోపు ప్రయాణాలను ఎంచుకోండి — అక్కడే కారు తక్కువ సమర్థవంతం, గాలి అత్యంత కలుషితం. వారానికి రెండు రోజులు కారు లేకుండా ఉన్నా సహాయం.',
      mechanism:
        'ఎగ్జాస్ట్, బ్రేక్/టైర్ కణాలు ప్రతి కిలోమీటరుకు విడుదలవుతాయి; ఆ కిలోమీటర్లను ప్రజా రవాణా లేదా కాలిబాటకు మార్చితే అవి స్థానికంగా తొలగిపోతాయి.',
      reduction: 'తప్పించిన కారు కిలోమీటర్లకు దాదాపు అనులోమానుపాతంలో; 10 కి.మీకి చిన్న కారు సుమారు 1 కిలో CO2, కొలవగల PM విడుదల చేస్తుంది.',
      assumption: 'ఊహ: సగటు పెట్రోల్ కారు, సాధారణ నగర వేగం, బస్సు/మెట్రో అయినా నడుస్తాయి.',
      confidence: 'Medium',
    },
    {
      title: 'చెత్త, ఆకులు, పంట అవశేషాలు ఎప్పుడూ కాల్చకండి',
      detail:
        'బయట ఏదీ కాల్చకండి, తోట చెత్త కూడా కాదు. అందుబాటులో ఉంటే బయోమాస్‌కు బదులు LPG లేదా ఇండక్షన్‌తో వండండి, ఇంట్లో బొగ్గు ఎప్పుడూ కాల్చకండి.',
      mechanism:
        'బయట కాల్చడం, ఘన ఇంధన వంట సూక్ష్మ కణాలు, బ్లాక్ కార్బన్‌ను ప్రజలు ఊపిరి పీల్చే చోటే విడుదల చేస్తాయి — చిమ్నీ, ఫిల్టర్ ఉండవు.',
      reduction: 'ఒక గంట చిన్న బయటి నిప్పు ఆ వీధి ట్రాఫిక్ కంటే ఎక్కువగా పొరుగు ప్రాంత గంటవారీ PM2.5ను ప్రభావితం చేయగలదు.',
      assumption: 'ప్రతి కిలో ఇంధనం లేదా చెత్త ఉద్గార కారకాల పోలిక ఆధారంగా.',
      confidence: 'High',
    },
    {
      title: 'విద్యుత్ వేడి, భాగస్వామ్య పరిష్కారాలు ఎంచుకోండి',
      detail:
        'కర్ర లేదా బొగ్గుకు బదులు ఎలక్ట్రిక్ రూమ్ హీటర్ లేదా హీట్ పంప్ ఎంచుకోండి, కాలుష్యం ఎక్కువగా ఉన్నప్పుడు పొరుగు ప్రాంతానికి భాగస్వామ్య శుభ్ర గాలి గది ఏర్పాటు చేయండి.',
      mechanism:
        'విద్యుత్ వేడి ఉద్గారాలను నియంత్రిత దూర విద్యుత్ కేంద్రానికి మారుస్తుంది; భాగస్వామ్య ఫిల్టర్ గదులు పరిమిత పరికరాలను అత్యంత ఉపయోగకరమైన చోట కేంద్రీకరిస్తాయి.',
      reduction: 'ఇంటి దహనం పూర్తిగా తొలగిపోతుంది; గ్రిడ్ ఉద్గారాలు స్థానిక విద్యుత్ ఉత్పత్తిపై ఆధారపడతాయి.',
      assumption: 'ఊహ: స్థానిక గ్రిడ్ బొగ్గు ఆధారితం కాదు; అలా అయితే నికర లాభం తక్కువ, కానీ లోపలి లాభం ఉంటుంది.',
      confidence: 'Medium',
    },
  ],
};

/** HEPA sizing rule of thumb: CADR ≈ floor area × ceiling height × 5 air changes/h. */
export function hepaCadr(roomSizeSqm: number, ceilingM = 2.4, ach = 5): number {
  return Math.round(roomSizeSqm * ceilingM * ach);
}
