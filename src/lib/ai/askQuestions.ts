import type { UiKey } from '@/lib/i18n';

/**
 * The fixed quick questions the assistant can answer.
 *
 * This module is deliberately free of zod and of any server import so the
 * browser can render the buttons without pulling the validation library into
 * the client bundle. The server validates the same closed list with
 * `askQuestionSchema` in `schemas.ts`.
 */
export const ASK_QUESTIONS = [
  'safeWalkToSchool',
  'whichRoomFirst',
  'openWindows',
  'exerciseOutside',
  'masksSchoolRun',
  'cookWithoutSmoke',
] as const;

export type AskQuestion = (typeof ASK_QUESTIONS)[number];

/** i18n key for each button label. */
export const ASK_LABEL_KEY: Record<AskQuestion, UiKey> = {
  safeWalkToSchool: 'askSafeWalk',
  whichRoomFirst: 'askWhichRoom',
  openWindows: 'askOpenWindows',
  exerciseOutside: 'askExercise',
  masksSchoolRun: 'askMasks',
  cookWithoutSmoke: 'askCook',
};

/** Runtime check for untrusted values (used by tests and the server schema). */
export function isAskQuestion(value: unknown): value is AskQuestion {
  return (
    typeof value === 'string' && (ASK_QUESTIONS as readonly string[]).includes(value)
  );
}
