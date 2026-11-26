import type { LanguageCopy } from './types';

/**
 * EN copy for the deterministic fallback plan.
 *
 * Reviewed as prose, not as code: every claim here is a rule of thumb and each
 * one carries its assumption.
 */
export const EN: LanguageCopy = {
  bands: {
    good: {
      headline: 'Clean air today — use it well.',
      meaning:
        'Air quality is in the good band. Outdoor activity is reasonable for almost everyone, and smoky or dusty jobs are best done today rather than on a bad day.',
      bestTime:
        'Most of the day is fine. Late morning (about 10:00–12:00) is usually the cleanest.',
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
      exercise:
        'Moderate outdoor exercise is acceptable; shorten hard sessions if you feel irritation.',
    },
    sensitive: {
      headline: 'Sensitive family members should ease off outdoor time.',
      meaning:
        'This band is unhealthy for sensitive groups. Children, elderly people, pregnant people and anyone with asthma, COPD or a heart condition should reduce long or hard outdoor activity.',
      bestTime:
        'Keep outdoor trips short and go in the cleanest hours shown on the chart — not at the evening peak.',
      mask: 'A well-fitting N95/FFP2 mask helps sensitive people on unavoidable trips outdoors.',
      school:
        'Use the shortest route, avoid main-road crossings, and keep the walk calm rather than rushed.',
      exercise:
        'Move hard exercise indoors or postpone it; children can play indoors today.',
    },
    unhealthy: {
      headline: 'Everyone should cut down outdoor exposure today.',
      meaning:
        'Air is unhealthy. Everyone may feel effects, and sensitive family members may feel them sooner. Treat outdoor time as something to plan, not default to.',
      bestTime:
        'Only essential trips; pick the cleanest hour on the chart and avoid the evening peak.',
      mask: 'Wear a well-fitting N95/FFP2 mask for any trip outside, and check the seal around the nose.',
      school:
        'Take the shortest route with the least traffic; ask the school about indoor play and whether windows stay shut.',
      exercise:
        'No outdoor exercise today. Indoor movement with windows closed is safer.',
    },
    veryUnhealthy: {
      headline: 'Serious pollution — plan the day around staying in.',
      meaning:
        'Air is very unhealthy. Everyone should avoid outdoor exertion. Homes leak pollution too, so one cleaned room matters more than usual.',
      bestTime:
        'Avoid going out. If you must, go in the cleanest hour on the chart and keep it under 30 minutes.',
      mask: 'An N95/FFP2 mask is strongly advised for any unavoidable trip outside.',
      school:
        'Keep the school run as short as possible, windows up in the vehicle, and ask about indoor break time.',
      exercise:
        'Cancel outdoor exercise. Stretch or move indoors with doors and windows closed.',
    },
    hazardous: {
      headline: 'Hazardous air — treat this as an emergency for lungs.',
      meaning:
        'Air is hazardous. Everyone is at risk, and sensitive family members are at serious risk. Stay indoors, keep windows shut, and use a filtered room if you have one.',
      bestTime:
        'Do not go outside unless it is essential. Wait for a clear improvement on the chart.',
      mask: 'If you must go out, wear a fitted N95/FFP2 mask for the whole trip — cloth masks do not filter this well.',
      school:
        'Keep children home if the school cannot keep them indoors; otherwise arrange the shortest possible trip.',
      exercise: 'No outdoor exercise at all. Rest indoors, away from windows.',
    },
  },
  indoor: [
    {
      title: 'Ventilate in short bursts, at the cleanest hour',
      detail:
        'Open opposite windows for 10–15 minutes when the chart shows the lowest AQI, then close them. Two or three short bursts beat one long open window on a smoggy day.',
      mechanism:
        'Short cross-ventilation swaps stale indoor air for outdoor air while limiting the total mass of particles that settles indoors.',
      reduction:
        'Indoor PM2.5 during the burst rises toward outdoor levels; the rest of the day stays lower than with windows open.',
      assumption:
        'Assumes window openings of roughly 1–2 m² and an outdoor PM2.5 at the value shown on the chart.',
      confidence: 'Medium',
    },
    {
      title: 'Close the gaps that leak most',
      detail:
        'Focus on door bottoms, window frames, exhaust fan flaps, and the gap under the main door. Foam tape and a door draught excluder are the cheapest fix.',
      mechanism:
        'Infiltration is driven by pressure differences; sealing the largest apertures cuts the volume of unfiltered outdoor air entering the room.',
      reduction:
        'Usually a modest share of total infiltration — the big leaks matter far more than hairline cracks.',
      assumption:
        'Assumes a typical apartment with a shared corridor and windows that already close fully.',
      confidence: 'Medium',
    },
    {
      title: 'Cut indoor combustion first',
      detail:
        'Avoid incense, mosquito coils and candle smoke indoors; cook with the chimney or exhaust fan running; if anyone smokes, keep it strictly outdoors and away from windows.',
      mechanism:
        'Incense, coils and cooking produce fine particles indoors directly, where there is no dispersion and no rain to wash them out.',
      reduction:
        'Removing one indoor combustion source often matters more indoors than anything done about outdoor air.',
      assumption:
        'Assumes daily incense or coil use, which is common in many Indian homes.',
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
      reduction:
        'A well-built box can move several hundred m³/h of filtered air, comparable to a mid-size commercial purifier.',
      assumption:
        'Assumes a standard 20-inch box fan, four 20-inch MERV-13 filters, and a room of about 20–30 m².',
      confidence: 'Medium',
    },
  ],
  sustainable: [
    {
      title: 'Replace short car trips with bus, metro, cycle or walking',
      detail:
        'Aim at the trips under 5 km first — they are the ones where a car is least efficient and the air is dirtiest. Even two car-free days a week helps.',
      mechanism:
        'Exhaust and brake/tyre particles are emitted per kilometre travelled; shifting those kilometres to public transport or muscle power removes them locally.',
      reduction:
        'Roughly proportional to the car kilometres avoided; a small car on 10 km emits on the order of 1 kg CO2 and measurable PM.',
      assumption:
        'Assumes an average petrol car, typical urban speeds, and that the bus or metro would run anyway.',
      confidence: 'Medium',
    },
    {
      title: 'Never burn waste, leaves or crop residue',
      detail:
        'Burn nothing in the open, including garden waste. Where it is available, cook with LPG or induction rather than biomass, and never burn coal indoors.',
      mechanism:
        'Open burning and solid-fuel cooking release fine particles and black carbon close to where people breathe, with no chimney and no filtering.',
      reduction:
        'One small open fire for an hour can dominate a neighbourhood’s hourly PM2.5 more than traffic on that street.',
      assumption:
        'Based on emission-factor comparisons per kilogram of fuel or waste burned.',
      confidence: 'High',
    },
    {
      title: 'Choose electric heat and shared solutions',
      detail:
        'Prefer an electric room heater or a heat pump over wood or coal, and organise a shared clean-air room for the neighbourhood during peaks.',
      mechanism:
        'Electric heating moves emissions to a distant power plant with controls, while shared filtered rooms concentrate limited equipment where it helps most.',
      reduction:
        'Removes indoor combustion entirely; the grid emissions depend on how the local electricity is generated.',
      assumption:
        'Assumes the local grid is not coal-dominated; if it is, the net benefit is smaller but the indoor benefit remains.',
      confidence: 'Medium',
    },
  ],
};
