'use client';

import type { Profile } from '@/lib/shared/schemas';
import type { Language } from '@/lib/shared/types';
import { LocalContextCard, WhyThisPlanFits, WithWithoutCard } from '../personal-context';

/**
 * The three tailoring surfaces the product brief asks for, in order:
 * why the plan fits this household, the with/without estimate, and local
 * seasonal context. Each is deterministic and computed in the browser.
 */
export function PlanContext({
  lang,
  profile,
  pm25,
  lat,
  lon,
}: {
  lang: Language;
  profile: Partial<Profile> | null | undefined;
  pm25: number | null | undefined;
  lat: number | null | undefined;
  lon: number | null | undefined;
}) {
  return (
    <>
      <WhyThisPlanFits profile={profile} lang={lang} />
      <WithWithoutCard pm25={pm25} profile={profile} lang={lang} />
      <LocalContextCard lat={lat} lon={lon} lang={lang} />
    </>
  );
}
