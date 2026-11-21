import { describe, expect, it } from 'vitest';
import { thinkingConfigFor } from '@/lib/gemini';

/**
 * `thinkingLevel` is a Gemini 3+ field; 2.5-and-earlier models reject it, and
 * `thinkingBudget` is deprecated for 3+. Sending nothing to older models keeps
 * a GEMINI_MODEL downgrade working instead of turning every plan into a fallback.
 */
describe('thinkingConfigFor', () => {
  it('asks Gemini 3 and later for low thinking (latency matters on this route)', () => {
    expect(thinkingConfigFor('gemini-3.5-flash')).toEqual({
      thinkingConfig: { thinkingLevel: 'low' },
    });
    expect(thinkingConfigFor('gemini-3.8-flash')).toEqual({
      thinkingConfig: { thinkingLevel: 'low' },
    });
    expect(thinkingConfigFor('gemini-4-neon')).toEqual({
      thinkingConfig: { thinkingLevel: 'low' },
    });
  });

  it('sends no thinkingConfig to models that would reject the field', () => {
    expect(thinkingConfigFor('gemini-2.5-flash')).toEqual({});
    expect(thinkingConfigFor('gemini-2.5-pro')).toEqual({});
    expect(thinkingConfigFor('gemma-4-31b-it')).toEqual({});
    expect(thinkingConfigFor('gemini-flash-latest')).toEqual({});
  });
});
