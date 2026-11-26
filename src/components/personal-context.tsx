'use client';

import { t } from '@/lib/i18n';
import { compareWithWithout, whyThisPlanFits } from '@/lib/impact';
import { regionalContext, regionalLabels } from '@/lib/regional';
import type { Profile } from '@/lib/schemas';
import type { Language } from '@/lib/types';
import { SectionHeading } from './ui';

/**
 * The three tailoring surfaces required by the product brief:
 * - why the plan matches this household,
 * - a deterministic with/without impact estimate (every number labelled),
 * - local, seasonal context that never leaves the browser.
 */

/**
 * Explains why the plan
 * matches this household, from the profile only.
 */
export function WhyThisPlanFits({
  profile,
  lang,
}: {
  profile: Partial<Profile> | null | undefined;
  lang: Language;
}) {
  const reasons = whyThisPlanFits(profile, lang);
  return (
    <section className="card mt-3" aria-labelledby="why-heading" data-testid="why-fits">
      <SectionHeading id="why-heading">{t(lang, 'whyFits')}</SectionHeading>
      <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
        {reasons.map((reason) => (
          <li key={reason}>{reason}</li>
        ))}
      </ul>
    </section>
  );
}

/**
 * Before/after estimate for
 * the top recommendations, with the assumption stated next to the number.
 */
export function WithWithoutCard({
  pm25,
  profile,
  lang,
}: {
  pm25: number | null | undefined;
  profile: Partial<Profile> | null | undefined;
  lang: Language;
}) {
  const comparison = compareWithWithout({ pm25, profile, language: lang });
  if (!comparison) return null;

  const { labels } = comparison;
  const estimate = `(${labels.roughEstimate})`;
  const rows = [
    { label: labels.without, value: comparison.baseline },
    { label: labels.with, value: comparison.withChanges },
    { label: labels.outdoors, value: comparison.outdoorWithMask },
  ];

  return (
    <section
      className="card mt-3"
      aria-labelledby="impact-heading"
      data-testid="with-without"
    >
      <SectionHeading id="impact-heading">{labels.title}</SectionHeading>

      <table className="mt-2 w-full text-sm">
        <caption className="sr-only">{labels.title}</caption>
        <tbody>
          {rows.map((row) => (
            <tr key={row.label} className="align-top">
              <th scope="row" className="py-1 pr-3 text-left font-semibold">
                {row.label}
              </th>
              <td className="py-1 tabular-nums">
                {row.value} {labels.unit}{' '}
                <span className="hint font-normal">{estimate}</span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <p className="hint mt-2">{labels.note}</p>

      <details className="mt-2">
        <summary className="cursor-pointer text-sm font-semibold">
          {labels.assumptions}
        </summary>
        <ul className="mt-2 space-y-2 text-sm">
          {comparison.steps.map((step) => (
            <li key={step.id}>
              <p className="font-semibold">
                {step.label} — {step.reductionPct}% ({labels.roughEstimate})
              </p>
              <p className="hint">{step.assumption}</p>
            </li>
          ))}
        </ul>
      </details>
    </section>
  );
}

/**
 * Regional context card
 * (season, burning, festivals) for the selected coordinates.
 */
export function LocalContextCard({
  lat,
  lon,
  lang,
  date,
}: {
  lat: number | null | undefined;
  lon: number | null | undefined;
  lang: Language;
  date?: Date;
}) {
  if (typeof lat !== 'number' || typeof lon !== 'number') return null;
  const context = regionalContext(lat, lon, date ?? new Date(), lang);
  const labels = regionalLabels(lang);

  return (
    <section
      className="card mt-3"
      aria-labelledby="local-heading"
      data-testid="local-context"
    >
      <SectionHeading id="local-heading">{labels.title}</SectionHeading>
      <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
        {context.notes.map((note) => (
          <li key={note}>{note}</li>
        ))}
      </ul>
      <p className="hint mt-2">{labels.assumption}</p>
    </section>
  );
}
