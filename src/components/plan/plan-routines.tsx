'use client';

import { t } from '@/lib/i18n';
import type { Language, Plan } from '@/lib/types';

/**
 * The four daily-routine answers: best time out, mask, school run, exercise.
 * Each is one card so a reader can find the line they need without reading the
 * whole plan.
 */
export function PlanRoutines({ plan, lang }: { plan: Plan; lang: Language }) {
  const routines = [
    { title: t(lang, 'bestTime'), body: plan.bestTimeToGoOut },
    { title: t(lang, 'mask'), body: plan.maskGuidance },
    { title: t(lang, 'school'), body: plan.schoolAndCommute },
    { title: t(lang, 'exercise'), body: plan.exerciseTiming },
  ];

  return (
    <div className="mt-3 grid gap-3 sm:grid-cols-2">
      {routines.map((routine) => (
        <div className="card-tight" key={routine.title}>
          <h3 className="text-sm font-bold">{routine.title}</h3>
          <p className="mt-1 text-sm">{routine.body}</p>
        </div>
      ))}
    </div>
  );
}
