'use client';

import { useEffect, useRef, useState } from 'react';
import { t } from '@/lib/i18n';
import type { Language } from '@/lib/shared/types';

/**
 * Speech synthesis for the plan text.
 *
 * Browsers only speak the first few thousand characters reliably, and an
 * utterance must be cancelled on unmount so the page does not keep talking
 * after the plan is gone. Both details live here so the view stays declarative.
 */

/** Characters sent to the synthesiser; the rest is available on the page. */
const MAX_SPEECH_CHARS = 4000;

/** The synthesiser, or null when the API is unavailable (also during SSR). */
function synthesiser(): SpeechSynthesis | null {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return null;
  return window.speechSynthesis;
}

/**
 * Best available voice: a voice for the reader's language, falling back to
 * English only when the reader is already reading English.
 */
function voiceFor(
  synth: SpeechSynthesis,
  lang: Language,
): SpeechSynthesisVoice | undefined {
  const voices = synth.getVoices();
  const preferred = voices.find((voice) => voice.lang.toLowerCase().startsWith(lang));
  if (preferred) return preferred;
  return lang === 'en'
    ? voices.find((voice) => voice.lang.toLowerCase().startsWith('en'))
    : undefined;
}

/** Detach handlers and forget the utterance so a cancel cannot fire callbacks. */
function detach(utterance: SpeechSynthesisUtterance): void {
  utterance.onend = null;
  utterance.onerror = null;
}

interface SessionDeps {
  text: string;
  lang: Language;
  utteranceRef: { current: SpeechSynthesisUtterance | null };
  setSpeaking: (value: boolean) => void;
  setError: (value: string | null) => void;
}

/** Build and attach the utterance, or explain why speech is unavailable. */
function speak(deps: SessionDeps): void {
  const { text, lang, utteranceRef, setSpeaking, setError } = deps;
  const synth = synthesiser();
  if (!synth) {
    setError(t(lang, 'readUnavailable'));
    return;
  }

  const voice = voiceFor(synth, lang);
  if (!voice && lang !== 'en') {
    setError(t(lang, 'readUnavailable'));
    return;
  }

  const utterance = new SpeechSynthesisUtterance(text.slice(0, MAX_SPEECH_CHARS));
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
    setError(t(lang, 'readUnavailable'));
  };
  synth.cancel();
  utteranceRef.current = utterance;
  synth.speak(utterance);
  setSpeaking(true);
}

/** Cancel whatever is being spoken and detach its handlers first. */
function cancelSpeech(
  utteranceRef: { current: SpeechSynthesisUtterance | null },
  setSpeaking: (value: boolean) => void,
): void {
  const active = utteranceRef.current;
  if (active) {
    detach(active);
    utteranceRef.current = null;
  }
  synthesiser()?.cancel();
  setSpeaking(false);
}

/**
 * Read the given text aloud, or stop reading.
 *
 * @param text Plan text to speak; truncated to the synthesiser's reliable range.
 * @param lang Reader's language, used to pick a voice.
 * @returns `speaking`, a localised `speechError`, and `toggle` for the button.
 */
export function useSpeech(
  text: string,
  lang: Language,
): { speaking: boolean; speechError: string | null; toggle: () => void } {
  const [speechError, setSpeechError] = useState<string | null>(null);
  const [speaking, setSpeaking] = useState(false);
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);

  // Cancel any in-flight speech when the view unmounts, otherwise the browser
  // keeps talking after the plan is gone.
  useEffect(() => {
    return () => {
      const active = utteranceRef.current;
      if (active) {
        detach(active);
        utteranceRef.current = null;
      }
      synthesiser()?.cancel();
    };
  }, []);

  return {
    speaking,
    speechError,
    toggle: () => {
      if (speaking) {
        cancelSpeech(utteranceRef, setSpeaking);
        return;
      }
      setSpeechError(null);
      speak({ text, lang, utteranceRef, setSpeaking, setError: setSpeechError });
    },
  };
}
