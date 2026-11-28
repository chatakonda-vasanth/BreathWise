import type { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { POST, maxDuration } from '@/app/api/plan/route';
import {
  FUNCTION_MAX_DURATION_S,
  LLM_ATTEMPT_TIMEOUT_MS,
  LLM_TOTAL_BUDGET_MS,
  ROUTE_RESPONSE_MARGIN_MS,
  UPSTREAM_TIMEOUT_MS,
} from '@/lib/shared/constants';
import { fallbackReasonLabel, t } from '@/lib/i18n';
import { __resetRateLimitState } from '@/lib/security/rateLimit';
import { planResponseSchema } from '@/lib/shared/schemas';
import { PROFILE } from '../fixtures';

/**
 * Route-level budget behaviour: a slow model must end as the labelled fallback
 * plan with HTTP 200, inside the function's own deadline, so Vercel never has to
 * kill the invocation with a 504.
 */

const ORIGIN = 'http://localhost:3000';

const ENV_KEYS = [
  'GEMINI_API_KEY',
  'GEMINI_MODEL',
  'LLM_DISABLED',
  'LLM_ATTEMPT_TIMEOUT_MS',
  'DAILY_LLM_CAP',
  'APP_ORIGIN',
  'UPSTASH_REDIS_REST_URL',
  'UPSTASH_REDIS_REST_TOKEN',
] as const;

let saved: Record<string, string | undefined> = {};

beforeEach(() => {
  saved = {};
  for (const key of ENV_KEYS) {
    saved[key] = process.env[key];
    delete process.env[key];
  }
  process.env.GEMINI_API_KEY = 'test-key-not-real';
  process.env.APP_ORIGIN = ORIGIN;
  process.env.DAILY_LLM_CAP = '200';
  // Short per-attempt cap so the test exercises the real timeout path in ms
  // rather than waiting the production 18 s.
  process.env.LLM_ATTEMPT_TIMEOUT_MS = '150';
  __resetRateLimitState();
});

afterEach(() => {
  for (const key of ENV_KEYS) {
    if (saved[key] === undefined) delete process.env[key];
    else process.env[key] = saved[key];
  }
  vi.unstubAllGlobals();
  __resetRateLimitState();
});

/** A provider that never answers on its own and only settles when aborted. */
function hangingUpstream() {
  return vi.fn(
    (_url: string, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        const signal = init?.signal;
        const abort = () =>
          reject(
            Object.assign(new Error('The operation was aborted.'), {
              name: 'TimeoutError',
            }),
          );
        if (!signal) return; // never resolves: catastrophically slow upstream
        if (signal.aborted) {
          abort();
          return;
        }
        signal.addEventListener('abort', abort, { once: true });
      }),
  );
}

async function postPlan(body: unknown) {
  const request = new Request(`${ORIGIN}/api/plan`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      origin: ORIGIN,
      'sec-fetch-site': 'same-origin',
    },
    body: JSON.stringify(body),
  });

  const started = Date.now();
  const response = await POST(request as unknown as NextRequest);
  const text = await response.text();
  const elapsedMs = Date.now() - started;
  let json: unknown = null;
  try {
    json = JSON.parse(text) as unknown;
  } catch {
    /* asserted through `text` when it is not JSON */
  }
  return { status: response.status, text, json, elapsedMs };
}

describe('POST /api/plan when the model is too slow', () => {
  it('returns the labelled fallback plan with a 200, not an error', async () => {
    const fetchMock = hangingUpstream();
    vi.stubGlobal('fetch', fetchMock);

    const result = await postPlan({
      profile: { ...PROFILE, language: 'en' },
      lat: 28.61,
      lon: 77.21,
      sample: true,
    });

    expect(result.status).toBe(200);
    const parsed = planResponseSchema.safeParse(result.json);
    expect(parsed.success).toBe(true);
    if (!parsed.success) throw new Error('response did not match the plan schema');

    // Labelled: the UI shows its fallback banner off exactly these two fields.
    expect(parsed.data.meta.generatedBy).toBe('fallback');
    expect(parsed.data.meta.fallbackReason).toBe('timeout');
    expect(parsed.data.plan.generatedBy).toBe('fallback');
    expect(parsed.data.plan.fallbackReason).toBe('timeout');
    expect(fallbackReasonLabel('en', 'timeout')).toBe('AI timed out');

    // A real plan body, not an empty shell.
    expect(parsed.data.plan.indoorHacks.length).toBeGreaterThan(0);
    expect(parsed.data.plan.headline.length).toBeGreaterThan(0);

    // A timeout is not retried, and the route answered inside its own budget.
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result.elapsedMs).toBeLessThan(3000);
    expect(result.elapsedMs).toBeLessThan(LLM_TOTAL_BUDGET_MS);
    expect(result.text).not.toContain('test-key-not-real');
  });

  it('quotes the same 25 s ceiling to the user that the budget enforces', () => {
    expect(LLM_TOTAL_BUDGET_MS).toBe(25_000);
    for (const language of ['en', 'hi', 'te'] as const) {
      expect(t(language, 'generatingSlow')).toContain('25');
    }
    // The slow-state cancel button and its fallback reason exist in every locale.
    for (const language of ['en', 'hi', 'te'] as const) {
      expect(t(language, 'cancelPlan').length).toBeGreaterThan(0);
      expect(fallbackReasonLabel(language, 'cancelled').length).toBeGreaterThan(0);
    }
  });

  it('keeps the timeout path well inside maxDuration', () => {
    expect(maxDuration).toBe(FUNCTION_MAX_DURATION_S);

    // One attempt may be longer than half the budget...
    expect(LLM_ATTEMPT_TIMEOUT_MS).toBeGreaterThan(LLM_TOTAL_BUDGET_MS / 2);
    // ...which is exactly why the retry gate exists: a retry only starts while
    // the first attempt stayed inside the first half, so the remaining half
    // bounds the second attempt.
    const retryWindowMs = LLM_TOTAL_BUDGET_MS - LLM_TOTAL_BUDGET_MS / 2;
    expect(retryWindowMs).toBeGreaterThan(0);
    expect(retryWindowMs).toBeLessThanOrEqual(LLM_TOTAL_BUDGET_MS);

    // The whole worst case (air fetch + all attempts + response margin)
    // must finish before Vercel's deadline, with slack left over.
    const worstCaseMs =
      UPSTREAM_TIMEOUT_MS + LLM_TOTAL_BUDGET_MS + ROUTE_RESPONSE_MARGIN_MS;
    expect(worstCaseMs).toBeLessThan(FUNCTION_MAX_DURATION_S * 1000);
    expect(FUNCTION_MAX_DURATION_S * 1000 - worstCaseMs).toBeGreaterThanOrEqual(1000);
  });
});
