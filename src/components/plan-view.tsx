'use client';

import { useEffect, useRef, useState } from 'react';
import { BAND_COLOURS } from '@/lib/aqi';
import { fallbackReasonLabel, SEVERITY_LABELS, t, tList } from '@/lib/i18n';
import type { Profile } from '@/lib/schemas';
import type { Language, Plan, Recommendation } from '@/lib/types';
import { LocalContextCard, WhyThisPlanFits, WithWithoutCard } from './personal-context';
import { Banner, BandChip, SectionHeading } from './ui';

/** Plain-text rendering used for sharing, clipboard and speech. No HTML, ever. */
export function planToText(plan: Plan, lang: Language): string {
  const lines: string[] = [];
  const confidence = (value: string) =>
    value === 'High'
      ? t(lang, 'confidenceHigh')
      : value === 'Medium'
        ? t(lang, 'confidenceMedium')
        : t(lang, 'confidenceLow');

  lines.push(`${t(lang, 'appName')} — ${t(lang, 'planFor')}: ${plan.headline}`);
  if (plan.medicalAlert) lines.push(`\n${t(lang, 'medicalAlertTitle')}: ${plan.medicalAlert}`);
  lines.push(`\n${t(lang, 'whatThisMeans')}\n${plan.whatThisMeans.text}`);
  lines.push(`\n${t(lang, 'cigarette')}: ${plan.whatThisMeans.cigaretteEquivalent}`);
  lines.push(`(${t(lang, 'assumption')}: ${plan.whatThisMeans.assumption})`);
  lines.push(`\n${t(lang, 'bestTime')}: ${plan.bestTimeToGoOut}`);
  lines.push(`${t(lang, 'mask')}: ${plan.maskGuidance}`);
  lines.push(`${t(lang, 'school')}: ${plan.schoolAndCommute}`);
  lines.push(`${t(lang, 'exercise')}: ${plan.exerciseTiming}`);

  const section = (title: string, items: Recommendation[]) => {
    lines.push(`\n== ${title} ==`);
    for (const item of items) {
      lines.push(`- ${item.title}: ${item.detail}`);
      lines.push(
        `  ${t(lang, 'mechanism')}: ${item.impact.mechanism} | ${t(lang, 'reduction')}: ${
          item.impact.estimatedReduction
        } | ${t(lang, 'assumption')}: ${item.impact.assumption} | ${t(lang, 'confidence')}: ${confidence(
          item.impact.confidence,
        )}`,
      );
    }
  };

  section(t(lang, 'indoor'), plan.indoorHacks);
  section(t(lang, 'sustainable'), plan.sustainableAlternatives);
  lines.push(`\n${t(lang, 'communityTitle')}`);
  for (const item of tList(lang, 'communityItems')) lines.push(`[ ] ${item}`);
  lines.push(t(lang, 'communityHelp'));
  lines.push(`\n${t(lang, 'footerMedical')}`);
  return lines.join('\n');
}

function ImpactBlock({ item, lang }: { item: Recommendation; lang: Language }) {
  const confidence =
    item.impact.confidence === 'High'
      ? t(lang, 'confidenceHigh')
      : item.impact.confidence === 'Medium'
        ? t(lang, 'confidenceMedium')
        : t(lang, 'confidenceLow');

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
          <dd className="inline font-semibold">{confidence}</dd>
        </div>
      </dl>
    </div>
  );
}

function RecommendationCard({
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

interface PlanViewProps {
  plan: Plan;
  lang: Language;
  onBack: () => void;
  onRegenerate: () => void;
  /** Household inputs, so the plan can explain what shaped it. */
  profile?: Partial<Profile> | null;
  /** Outdoor PM2.5 for the with/without estimate; null when unavailable. */
  pm25?: number | null;
  /** Rounded coordinates, used only for the local seasonal context. */
  lat?: number | null;
  lon?: number | null;
}

export function PlanView({
  plan,
  lang,
  onBack,
  onRegenerate,
  profile,
  pm25,
  lat,
  lon,
}: PlanViewProps) {
  const [copied, setCopied] = useState(false);
  const [speechError, setSpeechError] = useState<string | null>(null);
  const [speaking, setSpeaking] = useState(false);
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);

  // Cancel any in-flight speech when the view unmounts, otherwise the browser
  // keeps talking after the plan is gone.
  useEffect(() => {
    return () => {
      const active = utteranceRef.current;
      if (active) {
        active.onend = null;
        active.onerror = null;
        utteranceRef.current = null;
      }
      if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }
    };
  }, []);

  const text = planToText(plan, lang);
  const colour = BAND_COLOURS[plan.severity];

  async function copyText() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2500);
    } catch {
      setCopied(false);
    }
  }

  function readAloud() {
    setSpeechError(null);
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
      setSpeechError(t(lang, 'readUnavailable'));
      return;
    }
    const synth = window.speechSynthesis;
    const voices = synth.getVoices();
    const voice =
      voices.find((candidate) => candidate.lang.toLowerCase().startsWith(lang)) ??
      (lang === 'en'
        ? voices.find((candidate) => candidate.lang.toLowerCase().startsWith('en'))
        : undefined);

    if (!voice && lang !== 'en') {
      setSpeechError(t(lang, 'readUnavailable'));
      return;
    }

    const utterance = new SpeechSynthesisUtterance(text.slice(0, 4000));
    if (voice) {
      utterance.voice = voice;
      utterance.lang = voice.lang;
    }
    utterance.onend = () => {
      if (utteranceRef.current !== utterance) return;
      utteranceRef.current = null;
      setSpeaking(false);
    };
    utterance.onerror = (event) => {
      if (utteranceRef.current !== utterance) return;
      utteranceRef.current = null;
      setSpeaking(false);
      // A user-initiated stop surfaces as 'canceled'/'interrupted' in some
      // browsers; that is not a failure, so do not report it as one.
      if (event.error === 'canceled' || event.error === 'interrupted') return;
      setSpeechError(t(lang, 'readUnavailable'));
    };
    synth.cancel();
    utteranceRef.current = utterance;
    synth.speak(utterance);
    setSpeaking(true);
  }

  function stopReading() {
    const active = utteranceRef.current;
    if (active) {
      // Detach handlers first so the cancel does not fire an error/end that
      // would flip the button back into 'read aloud' state unexpectedly.
      active.onend = null;
      active.onerror = null;
      utteranceRef.current = null;
    }
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
    setSpeaking(false);
  }

  function toggleReading() {
    if (speaking) {
      stopReading();
      return;
    }
    readAloud();
  }

  const whatsappHref = `https://wa.me/?text=${encodeURIComponent(text.slice(0, 3500))}`;

  return (
    <section aria-labelledby="plan-heading" data-band={plan.severity}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <SectionHeading id="plan-heading">{t(lang, 'stepPlan')}</SectionHeading>
        <BandChip
          band={plan.severity}
          label={SEVERITY_LABELS[lang][plan.severity]}
          glyph={colour.glyph}
        />
      </div>

      {plan.medicalAlert ? (
        <div className="mt-3">
          <Banner tone="danger" title={t(lang, 'medicalAlertTitle')}>
            <p>{plan.medicalAlert}</p>
            <p className="mt-1 font-semibold">{t(lang, 'medicalNotice')}</p>
          </Banner>
        </div>
      ) : null}

      {plan.generatedBy === 'fallback' ? (
        <div className="mt-3">
          <Banner tone="warn" title={t(lang, 'fallbackShown')}>
            <p>
              {plan.fallbackReason
                ? `${t(lang, 'fallbackReason')}: ${fallbackReasonLabel(lang, plan.fallbackReason)}`
                : t(lang, 'fallbackShown')}
            </p>
          </Banner>
        </div>
      ) : null}

      <div className="card mt-3">
        <h2 className="text-xl font-bold">{plan.headline}</h2>
        <p className="hint mt-1">
          {plan.generatedBy === 'llm'
            ? t(lang, 'planSourceLlm')
            : t(lang, 'planSourceFallback')}
        </p>
      </div>

      <div className="card mt-3">
        <h3 className="text-base font-bold">{t(lang, 'whatThisMeans')}</h3>
        <p className="mt-1 text-sm">{plan.whatThisMeans.text}</p>
        <div className="mt-3 rounded-lg border border-[var(--border)] p-3">
          <p className="text-xs font-bold uppercase tracking-wide">{t(lang, 'cigarette')}</p>
          <p className="mt-1 text-sm">{plan.whatThisMeans.cigaretteEquivalent}</p>
          <p className="hint mt-1">
            {t(lang, 'assumption')}: {plan.whatThisMeans.assumption}
          </p>
          <p className="hint mt-1">{t(lang, 'cigaretteApprox')}</p>
        </div>
      </div>

      <WhyThisPlanFits profile={profile} lang={lang} />
      <WithWithoutCard pm25={pm25} profile={profile} lang={lang} />
      <LocalContextCard lat={lat} lon={lon} lang={lang} />

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        {[
          { title: t(lang, 'bestTime'), body: plan.bestTimeToGoOut },
          { title: t(lang, 'mask'), body: plan.maskGuidance },
          { title: t(lang, 'school'), body: plan.schoolAndCommute },
          { title: t(lang, 'exercise'), body: plan.exerciseTiming },
        ].map((routine) => (
          <div className="card-tight" key={routine.title}>
            <h3 className="text-sm font-bold">{routine.title}</h3>
            <p className="mt-1 text-sm">{routine.body}</p>
          </div>
        ))}
      </div>

      <section className="mt-5" aria-labelledby="indoor-heading">
        <SectionHeading id="indoor-heading">{t(lang, 'indoor')}</SectionHeading>
        <ul className="mt-2 grid gap-3" role="list">
          {plan.indoorHacks.map((item, index) => (
            <RecommendationCard key={`${item.title}-${index}`} item={item} lang={lang} index={index} />
          ))}
        </ul>
      </section>

      <section className="mt-5" aria-labelledby="sustainable-heading">
        <SectionHeading id="sustainable-heading">{t(lang, 'sustainable')}</SectionHeading>
        <ul className="mt-2 grid gap-3" role="list">
          {plan.sustainableAlternatives.map((item, index) => (
            <RecommendationCard
              key={`${item.title}-${index}`}
              item={item}
              lang={lang}
              index={index}
            />
          ))}
        </ul>
      </section>

      <section className="mt-5" aria-labelledby="community-heading">
        <SectionHeading id="community-heading">{t(lang, 'communityTitle')}</SectionHeading>
        <div className="card mt-2">
          <p className="hint">{t(lang, 'communityHelp')}</p>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
            {tList(lang, 'communityItems').map((item) => (
              <li key={item}>
                <label className="flex items-start gap-2">
                  <input type="checkbox" className="mt-1 h-4 w-4" aria-label={item} />
                  <span>{item}</span>
                </label>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <div className="mt-4 flex flex-wrap gap-2 no-print">
        <button type="button" className="btn" onClick={toggleReading} aria-pressed={speaking}>
          {speaking ? t(lang, 'stopReading') : t(lang, 'readAloud')}
        </button>
        <button type="button" className="btn" onClick={copyText}>
          {copied ? t(lang, 'copied') : t(lang, 'copy')}
        </button>
        <a className="btn" href={whatsappHref} target="_blank" rel="noopener noreferrer">
          {t(lang, 'whatsapp')}
        </a>
        <button type="button" className="btn" onClick={() => window.print()}>
          {t(lang, 'print')}
        </button>
        <button type="button" className="btn" onClick={onRegenerate}>
          {t(lang, 'retry')}
        </button>
        <button type="button" className="btn" onClick={onBack}>
          {t(lang, 'back')}
        </button>
      </div>

      {speechError ? (
        <p className="mt-2 text-sm font-semibold" role="status">
          {speechError}
        </p>
      ) : null}

      <p className="hint mt-3">{t(lang, 'footerMedical')}</p>
    </section>
  );
}
