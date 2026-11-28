import type { NextRequest } from 'next/server';
import type { z } from 'zod';
import { MAX_BODY_BYTES, RATE_LIMITS } from '@/lib/shared/constants';
import { getClientIp } from '@/lib/security/clientIp';
import { checkOrigin, errorResponse, logEvent, type ErrorCode } from '@/lib/shared/http';
import { readJsonBody } from '@/lib/security/requestBody';
import { enforceRateLimit } from '@/lib/security/rateLimit';
import { planRequestSchema } from '@/lib/shared/schemas';

/** A request that passed every gate, or the response that rejected it. */
type PlanRequest = z.infer<typeof planRequestSchema>;
export type GateResult =
  | { ok: true; data: PlanRequest; limiterUnavailable: boolean }
  | { ok: false; response: Response };

/** Map a body-read failure onto the client-facing error code. */
function bodyErrorCode(
  reason: 'too_large' | 'invalid_json' | 'unsupported_media_type',
): ErrorCode {
  if (reason === 'too_large') return 'body_too_large';
  if (reason === 'unsupported_media_type') return 'unsupported_media_type';
  return 'invalid_input';
}

/** Reject a cross-site request; this route can spend money. */
export function originGate(request: NextRequest, started: number): Response | null {
  const origin = checkOrigin(request);
  if (origin.ok) return null;
  logEvent({
    route: '/api/plan',
    status: 403,
    durationMs: Date.now() - started,
    outcome: origin.reason ?? 'forbidden_origin',
  });
  return errorResponse('forbidden_origin');
}

/**
 * Rate-limit the request and fail closed: this route can spend money.
 *
 * A missing or unreachable limiter must never leave this route unlimited. The
 * app's purpose is to give a safe plan, so instead of an error the request
 * continues to the labelled rule-based plan with no model call.
 */
export async function limitGate(
  request: NextRequest,
  started: number,
): Promise<{ response: Response } | { limiterUnavailable: boolean }> {
  const limit = await enforceRateLimit({
    name: 'plan',
    limit: RATE_LIMITS.plan.limit,
    windowMs: RATE_LIMITS.plan.windowMs,
    ip: getClientIp(new Headers(request.headers)),
  });
  if (limit.ok) return { limiterUnavailable: false };
  if (limit.reason === 'limiter_unavailable') return { limiterUnavailable: true };

  logEvent({
    route: '/api/plan',
    status: 429,
    durationMs: Date.now() - started,
    outcome: limit.reason ?? 'rate_limited',
  });
  return {
    response: errorResponse('rate_limited', {
      'Retry-After': String(limit.retryAfterSeconds),
    }),
  };
}

/** Bounded, strict JSON body: the only input this route accepts. */
export async function bodyGate(request: NextRequest, started: number): Promise<GateResult> {
  const body = await readJsonBody(request, MAX_BODY_BYTES);
  if (!body.ok) {
    logEvent({ route: '/api/plan', status: 400, durationMs: Date.now() - started });
    return { ok: false, response: errorResponse(bodyErrorCode(body.reason)) };
  }

  const parsed = planRequestSchema.safeParse(body.value);
  if (!parsed.success) {
    logEvent({ route: '/api/plan', status: 400, durationMs: Date.now() - started });
    return { ok: false, response: errorResponse('invalid_input') };
  }

  return { ok: true, data: parsed.data, limiterUnavailable: false };
}
