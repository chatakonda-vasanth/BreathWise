import { pm25UsAqi } from '@/lib/aqi';
import type { AirPoint, AirSnapshot } from '@/lib/types';

function series(pm25Values: number[], startHour: number): AirPoint[] {
  return pm25Values.map((pm25, index) => ({
    time: `2026-01-15T${String((startHour + index + 24) % 24).padStart(2, '0')}:00`,
    usAqi: pm25UsAqi(pm25),
    pm25,
    pm10: Math.round(pm25 * 1.9),
    no2: 40,
    o3: 50,
  }));
}

export const SNAPSHOT: AirSnapshot = {
  lat: 19.08,
  lon: 72.88,
  timezone: 'Asia/Kolkata',
  fetchedAt: '2026-01-15T10:00:00.000Z',
  current: {
    time: '2026-01-15T10:00',
    usAqi: 180,
    pm25: 120,
    pm10: 230,
    no2: 45,
    o3: 60,
  },
  history: series(new Array(24).fill(110), -24),
  forecast: series(new Array(24).fill(130), 0),
  source: 'Open-Meteo Air Quality (CAMS)',
  isSample: false,
};

export const VALID_LLM_OUTPUT = {
  headline: 'Keep outdoor time short today.',
  whatThisMeans: 'Air is unhealthy for everyone. Plan errands for the cleanest hour.',
  cigaretteEquivalentNote: 'Very roughly 5.5 cigarettes a day — a rough approximation only.',
  bestTimeToGoOut: 'Late morning, when the chart shows the lowest value.',
  maskGuidance: 'Wear a fitted N95 mask for any trip outside.',
  schoolAndCommute: 'Shortest route, windows up in the vehicle.',
  exerciseTiming: 'No outdoor exercise; move indoors.',
  indoorHacks: [
    {
      title: 'Ventilate briefly',
      detail: 'Open opposite windows for 10 minutes at the cleanest hour.',
      impact: {
        mechanism: 'Short cross-ventilation swaps stale air.',
        estimatedReduction: 'Lower average indoor PM2.5 than windows left open.',
        assumption: 'Assumes the chart values are representative for the hour.',
        confidence: 'Medium',
      },
    },
    {
      title: 'Seal door gaps',
      detail: 'Foam tape on the main door and exhaust fan flap.',
      impact: {
        mechanism: 'Cuts pressure-driven infiltration.',
        estimatedReduction: 'A modest share of total infiltration.',
        assumption: 'Assumes a shared corridor and well-closing windows.',
        confidence: 'Medium',
      },
    },
    {
      title: 'Stop indoor incense',
      detail: 'Skip incense and coils indoors.',
      impact: {
        mechanism: 'Removes an indoor particle source.',
        estimatedReduction: 'Often larger than any outdoor measure indoors.',
        assumption: 'Assumes daily incense use.',
        confidence: 'High',
      },
    },
  ],
  sustainableAlternatives: [
    {
      title: 'Take the bus for short trips',
      detail: 'Swap car trips under 5 km.',
      impact: {
        mechanism: 'Removes tailpipe emissions per kilometre.',
        estimatedReduction: 'Proportional to kilometres avoided.',
        assumption: 'Assumes an average petrol car.',
        confidence: 'Medium',
      },
    },
    {
      title: 'Never burn waste',
      detail: 'No open burning of leaves or waste.',
      impact: {
        mechanism: 'Removes a direct particle source near homes.',
        estimatedReduction: 'Can dominate neighbourhood hourly PM2.5.',
        assumption: 'Based on emission factors per kg burned.',
        confidence: 'High',
      },
    },
  ],
};

export const HINDI_LLM_OUTPUT = {
  ...VALID_LLM_OUTPUT,
  headline: 'आज बाहर का समय कम रखें।',
  whatThisMeans: 'हवा सभी के लिए अस्वस्थ है। सबसे साफ़ घंटे में काम करें।',
  cigaretteEquivalentNote: 'मोटे तौर पर प्रतिदिन 5.5 सिगरेट के बराबर — केवल अनुमान।',
  bestTimeToGoOut: 'सुबह के अंत में, जब चार्ट सबसे कम मान दिखाए।',
  maskGuidance: 'बाहर जाने पर अच्छी तरह फिट N95 मास्क पहनें।',
  schoolAndCommute: 'सबसे छोटा रास्ता, वाहन की खिड़कियाँ बंद।',
  exerciseTiming: 'बाहर व्यायाम नहीं; घर के अंदर करें।',
  indoorHacks: VALID_LLM_OUTPUT.indoorHacks.map((item, index) => ({
    ...item,
    title: `भीतरी उपाय ${index + 1}`,
    detail: 'छोटी अवधि के लिए खिड़कियाँ खोलें और फिर बंद करें।',
  })),
  sustainableAlternatives: VALID_LLM_OUTPUT.sustainableAlternatives.map((item, index) => ({
    ...item,
    title: `टिकाऊ विकल्प ${index + 1}`,
    detail: 'छोटी यात्राओं के लिए बस या मेट्रो चुनें।',
  })),
};

export const TELUGU_LLM_OUTPUT = {
  ...VALID_LLM_OUTPUT,
  headline: 'ఈరోజు బయటి సమయాన్ని తగ్గించండి.',
  whatThisMeans: 'గాలి అందరికీ అనారోగ్యకరం. శుభ్రమైన గంటలో పనులు చేయండి.',
  cigaretteEquivalentNote: 'సుమారు రోజుకు 5.5 సిగరెట్లకు సమానం — అంచనా మాత్రమే.',
  bestTimeToGoOut: 'ఉదయం చివర, చార్ట్ తక్కువ విలువ చూపినప్పుడు.',
  maskGuidance: 'బయటకు వెళ్లేటప్పుడు సరిగా కూర్చున్న N95 మాస్క్ పెట్టుకోండి.',
  schoolAndCommute: 'అత్యంత పొట్టి మార్గం, వాహనంలో కిటికీలు మూసి.',
  exerciseTiming: 'బయట వ్యాయామం వద్దు; ఇంట్లో చేయండి.',
  indoorHacks: VALID_LLM_OUTPUT.indoorHacks.map((item, index) => ({
    ...item,
    title: `ఇంటి చిట్కా ${index + 1}`,
    detail: 'కొద్దిసేపు కిటికీలు తెరిచి మూసేయండి.',
  })),
  sustainableAlternatives: VALID_LLM_OUTPUT.sustainableAlternatives.map((item, index) => ({
    ...item,
    title: `స్థిరమైన ఎంపిక ${index + 1}`,
    detail: 'చిన్న ప్రయాణాలకు బస్సు లేదా మెట్రో ఎంచుకోండి.',
  })),
};

export const PROFILE = {
  adults: 2,
  children: 1,
  elderly: 0,
  pregnant: false,
  sensitiveGroup: false,
  homeType: 'apartment' as const,
  windows: 'single' as const,
  kitchenVentilation: 'exhaustFan' as const,
  commuteMode: 'bus' as const,
  budget: 'low' as const,
  language: 'en' as const,
  roomSizeSqm: 22,
  symptoms: false,
};
