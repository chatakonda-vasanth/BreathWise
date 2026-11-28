'use client';

import { confidenceLabel } from '@/lib/ai/planText';
import { t } from '@/lib/i18n';
import type { Language, Plan, Recommendation } from '@/lib/shared/types';
import { SectionHeading } from '../ui';

/** The four labelled impact fields every recommendation carries. */
export function ImpactBlock({ item, lang }: { item: Recommendation; lang: Language }) {
  return (
    <div className="mt-3 rounded-lg border border-[var(--border)] bg-[var(--surface-2)] p-3">
      <p className="text-xs font-bold uppercase tracking-wide">{t(lang, 'impact')}</p>
      <dl className="mt-1 grid gap-1 text-sm">
        <div>
          <dt className="inline font-semibold">{t(lang, 'mechanism')}: </dt>
          <dd className="inline">{item.impact.mechanism}</dd>
        </div>
        <div>
          <dt className="inline font-semibold">{t(lang, 'reduction')}: </dt>
          <dd className="inline">{item.impact.estimatedReduction}</dd>
        </div>
        <div>
          <dt className="inline font-semibold">{t(lang, 'assumption')}: </dt>
          <dd className="inline">{item.impact.assumption}</dd>
        </div>
        <div>
          <dt className="inline font-semibold">{t(lang, 'confidence')}: </dt>
          <dd className="inline font-semibold">
            {confidenceLabel(item.impact.confidence, lang)}
          </dd>
        </div>
      </dl>
    </div>
  );
}

/** One numbered recommendation with its impact explanation. */
export function RecommendationCard({
  item,
  lang,
  index,
}: {
  item: Recommendation;
  lang: Language;
  index: number;
}) {
  return (
    <li className="card">
      <h3 className="text-base font-bold">
        {index + 1}. {item.title}
      </h3>
      <p className="mt-1 text-sm">{item.detail}</p>
      <ImpactBlock item={item} lang={lang} />
    </li>
  );
}

/** The two recommendation lists every plan carries. */
export function PlanRecommendations({ plan, lang }: { plan: Plan; lang: Language }) {
  return (
    <>
      <RecommendationSection
        id="indoor-heading"
        title={t(lang, 'indoor')}
        items={plan.indoorHacks}
        lang={lang}
      />
      <RecommendationSection
        id="sustainable-heading"
        title={t(lang, 'sustainable')}
        items={plan.sustainableAlternatives}
        lang={lang}
      />
    </>
  );
}

/** A titled list of recommendations, each numbered from one. */
export function RecommendationSection({
  id,
  title,
  items,
  lang,
}: {
  id: string;
  title: string;
  items: Recommendation[];
  lang: Language;
}) {
  return (
    <section className="mt-5" aria-labelledby={id}>
      <SectionHeading id={id}>{title}</SectionHeading>
      <ul className="mt-2 grid gap-3" role="list">
        {items.map((item, index) => (
          <RecommendationCard
            key={`${item.title}-${index}`}
            item={item}
            lang={lang}
            index={index}
          />
        ))}
      </ul>
    </section>
  );
}
