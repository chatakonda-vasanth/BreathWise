import { t, tList } from '@/lib/i18n';
import type { Language, Plan, Recommendation } from '@/lib/shared/types';

/**
 * Plain-text rendering of a plan, used for sharing, the clipboard and speech.
 *
 * No HTML is ever produced: every line is text the reader already sees on
 * screen, so a copy cannot carry markup or hidden content.
 */

/**
 * Localised label for a recommendation's confidence.
 *
 * @param value One of `'High' | 'Medium' | 'Low'` (unknown values read as Low).
 * @param lang Reader's language.
 */
export function confidenceLabel(value: string, lang: Language): string {
  if (value === 'High') return t(lang, 'confidenceHigh');
  if (value === 'Medium') return t(lang, 'confidenceMedium');
  return t(lang, 'confidenceLow');
}

/** Longest share text accepted by the WhatsApp link, in characters. */
const MAX_SHARE_CHARS = 3500;

/**
 * WhatsApp share link for a plan's text.
 *
 * The text is URL-encoded and truncated to a length the link accepts; nothing
 * is sent until the reader taps send.
 */
export function whatsappShareHref(text: string): string {
  return `https://wa.me/?text=${encodeURIComponent(text.slice(0, MAX_SHARE_CHARS))}`;
}

/** Append one recommendation section (title plus one block per item). */
function appendSection(
  lines: string[],
  title: string,
  items: Recommendation[],
  lang: Language,
) {
  lines.push(`\n== ${title} ==`);
  for (const item of items) {
    lines.push(`- ${item.title}: ${item.detail}`);
    lines.push(
      `  ${t(lang, 'mechanism')}: ${item.impact.mechanism} | ${t(lang, 'reduction')}: ${
        item.impact.estimatedReduction
      } | ${t(lang, 'assumption')}: ${item.impact.assumption} | ${t(lang, 'confidence')}: ${confidenceLabel(
        item.impact.confidence,
        lang,
      )}`,
    );
  }
}

/**
 * Render a plan as plain text.
 *
 * @param plan Validated plan for the current severity band.
 * @param lang Reader's language; all headings come from the i18n pack.
 * @returns Newline-separated text, safe to put on the clipboard or speak.
 */
export function planToText(plan: Plan, lang: Language): string {
  const lines: string[] = [];

  lines.push(`${t(lang, 'appName')} — ${t(lang, 'planFor')}: ${plan.headline}`);
  if (plan.medicalAlert) {
    lines.push(`\n${t(lang, 'medicalAlertTitle')}: ${plan.medicalAlert}`);
  }
  lines.push(`\n${t(lang, 'whatThisMeans')}\n${plan.whatThisMeans.text}`);
  lines.push(`\n${t(lang, 'cigarette')}: ${plan.whatThisMeans.cigaretteEquivalent}`);
  lines.push(`(${t(lang, 'assumption')}: ${plan.whatThisMeans.assumption})`);
  lines.push(`\n${t(lang, 'bestTime')}: ${plan.bestTimeToGoOut}`);
  lines.push(`${t(lang, 'mask')}: ${plan.maskGuidance}`);
  lines.push(`${t(lang, 'school')}: ${plan.schoolAndCommute}`);
  lines.push(`${t(lang, 'exercise')}: ${plan.exerciseTiming}`);

  appendSection(lines, t(lang, 'indoor'), plan.indoorHacks, lang);
  appendSection(lines, t(lang, 'sustainable'), plan.sustainableAlternatives, lang);

  lines.push(`\n${t(lang, 'communityTitle')}`);
  for (const item of tList(lang, 'communityItems')) lines.push(`[ ] ${item}`);
  lines.push(t(lang, 'communityHelp'));
  lines.push(`\n${t(lang, 'footerMedical')}`);
  return lines.join('\n');
}
