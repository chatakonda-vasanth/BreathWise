'use client';

import { useRef, useState } from 'react';
import { ApiError, requestPlan } from '@/lib/client';
import { buildFallbackPlan } from '@/lib/fallbackPlan';
import { t } from '@/lib/i18n';
import type { Plan } from '@/lib/types';
import type { PlanRequestInput } from './use-plan-request';

/** How long before the plan spinner admits that generation is slow. */
const SLOW_PLAN_MS = 5000;

/** User-facing text for a failed plan request; never the server's raw code. */
function planErrorMessage(error: unknown, lang: PlanRequestInput['lang']): string {
  const code = error instanceof ApiError ? error.code : '';
  return code === 'upstream_unavailable' ? t(lang, 'unavailable') : t(lang, 'planFailed');
}

/** Everything that can change the answer, as one cache key. */
function planCacheKey(input: PlanRequestInput): string {
  return JSON.stringify([
    input.profile,
    input.lang,
    input.airData?.indices.severity ?? null,
    input.airData?.air.isSample ?? false,
    input.location.lat,
    input.location.lon,
  ]);
}

/** State setters and refs the request needs; bundled so it stays a pure call. */
interface GenerationDeps {
  cache: Map<string, Plan>;
  abort: { current: AbortController | null };
  show: (plan: Plan) => void;
  setLoading: (value: boolean) => void;
  setSlow: (value: boolean) => void;
  setError: (message: string | null) => void;
}

/**
 * Run the plan request, store the result and resolve the loading state.
 *
 * A cancelled request is not an error: the caller has already put the local
 * fallback on screen.
 */
async function requestAndCache(
  input: PlanRequestInput,
  key: string,
  deps: GenerationDeps,
): Promise<void> {
  // A regenerate must not race the previous request.
  deps.abort.current?.abort();
  const controller = new AbortController();
  deps.abort.current = controller;
  // A real generation can take 10-20 s; after 5 s say so instead of leaving a
  // silent spinner. The timer is cleared with the request.
  const slowTimer = setTimeout(() => deps.setSlow(true), SLOW_PLAN_MS);
  try {
    const response = await requestPlan(
      {
        profile: { ...input.profile, language: input.lang },
        lat: input.location.lat,
        lon: input.location.lon,
        sample: input.airData?.air.isSample ?? false,
      },
      controller.signal,
    );
    deps.cache.set(key, response.plan);
    deps.show(response.plan);
  } catch (error) {
    if (controller.signal.aborted) return;
    deps.setError(planErrorMessage(error, input.lang));
  } finally {
    clearTimeout(slowTimer);
    deps.setSlow(false);
    deps.setLoading(false);
    if (deps.abort.current === controller) deps.abort.current = null;
  }
}

/** The local fallback shown when the reader cancels a slow generation. */
function cancelledPlan(input: PlanRequestInput): Plan | null {
  if (!input.airData) return null;
  return buildFallbackPlan({
    snapshot: input.airData.air,
    profile: { ...input.profile, language: input.lang },
    language: input.lang,
    severity: input.airData.indices.severity,
    naqiBand: input.airData.indices.naqi.band,
    reason: 'cancelled',
  });
}

export interface GenerationState {
  plan: Plan | null;
  planLoading: boolean;
  planSlow: boolean;
  planError: string | null;
  submit: (input: PlanRequestInput) => Promise<void>;
  cancel: (input: PlanRequestInput) => void;
  reset: () => void;
}

/**
 * Plan generation with an in-session cache.
 *
 * @param onReady Called whenever a plan is on screen (generated, cached or the
 * local fallback after a cancel), so the caller can advance its step.
 */
export function usePlanGeneration(onReady: () => void): GenerationState {
  const [plan, setPlan] = useState<Plan | null>(null);
  const [planLoading, setPlanLoading] = useState(false);
  const [planSlow, setPlanSlow] = useState(false);
  const [planError, setPlanError] = useState<string | null>(null);
  const abort = useRef<AbortController | null>(null);
  /**
   * Plans already generated in this session, keyed by everything that can
   * change the answer. Regenerating with the same profile in the same AQI band
   * would ask the model for byte-identical work, so it is served from memory
   * instead — no request, no rate-limit slot, no model call.
   */
  const cache = useRef(new Map<string, Plan>());

  function show(next: Plan): void {
    setPlan(next);
    onReady();
  }

  async function submit(input: PlanRequestInput): Promise<void> {
    const key = planCacheKey(input);
    const cached = cache.current.get(key);
    if (cached) {
      setPlanError(null);
      setPlanLoading(false);
      show(cached);
      return;
    }

    setPlanLoading(true);
    setPlanSlow(false);
    setPlanError(null);
    setPlan(null);
    await requestAndCache(input, key, {
      cache: cache.current,
      abort,
      show,
      setLoading: setPlanLoading,
      setSlow: setPlanSlow,
      setError: setPlanError,
    });
  }

  /**
   * Cancel a slow generation. The deterministic plan is built in the browser
   * from the snapshot already on screen, so the user gets the guidance at once
   * instead of waiting for the model or the request to unwind.
   */
  function cancel(input: PlanRequestInput): void {
    const cancelled = cancelledPlan(input);
    if (!cancelled) return;
    abort.current?.abort();
    abort.current = null;
    setPlan(cancelled);
    setPlanSlow(false);
    setPlanLoading(false);
    onReady();
  }

  return {
    plan,
    planLoading,
    planSlow,
    planError,
    submit,
    cancel,
    reset: () => setPlan(null),
  };
}
