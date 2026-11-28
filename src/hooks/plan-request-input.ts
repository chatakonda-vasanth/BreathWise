import type { AirResponse } from '@/lib/shared/apiSchemas';
import type { SelectedLocation } from '@/lib/shared/location';
import type { Profile } from '@/lib/shared/schemas';
import type { Language } from '@/lib/shared/types';

/** Everything that can change the answer and the place it is for. */
export interface PlanRequestInput {
  profile: Profile;
  lang: Language;
  airData: AirResponse | null;
  location: SelectedLocation;
}
