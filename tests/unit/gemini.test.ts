import { afterEach, describe, expect, it, vi } from 'vitest';
import { LlmError, callGemini, thinkingConfigFor } from '@/lib/ai/gemini';

afterEach(() => {
  vi.unstubAllGlobals();
});

const OK_BODY = JSON.stringify({
  candidates: [{ content: { parts: [{ text: '{"ok":true}' }] } }],
});

// Regression: workerd rejects `redirect: 'error'`, so a deployed plan request
// failed at the transport layer instead of reaching the model.
describe('callGemini transport', () => {
  it('sends only fetch options that workerd accepts', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(OK_BODY, {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await callGemini({
      apiKey: 'test-key',
      system: 's',
      user: 'u',
      model: 'gemini-3.5-flash',
    });
    const init = fetchMock.mock.calls[0]?.[1] as RequestInit | undefined;
    expect(init?.redirect).toBe('manual');
    expect(init?.cache).toBe('no-store');
  });

  it('rejects a redirect instead of following it', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(null, {
          status: 307,
          headers: { location: 'https://169.254.169.254/latest/meta-data/' },
        }),
      ),
    );
    await expect(
      callGemini({
        apiKey: 'test-key',
        system: 's',
        user: 'u',
        model: 'gemini-3.5-flash',
      }),
    ).rejects.toBeInstanceOf(LlmError);
  });
});

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
