import type { AskQuestion } from './askQuestions';
import type { Profile } from './schemas';
import {
  isAirResponse,
  isAnswerResponse,
  isGeocodeResponse,
  isPlanResponse,
} from './responseGuards';

/**
 * Browser-side API access. Every response is shape-checked before use; see
 * `responseGuards` for why the checks are hand-written instead of zod (zod is
 * a server-side parse of untrusted input, and ~40 KiB the browser need not
 * download).
 */

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
  ) {
    super(code);
    this.name = 'ApiError';
  }
}

async function requestJson(url: string, init?: RequestInit): Promise<unknown> {
  const response = await fetch(url, {
    ...init,
    headers: {
      accept: 'application/json',
      ...(init?.body ? { 'content-type': 'application/json' } : {}),
      ...init?.headers,
    },
    credentials: 'same-origin',
  });
  const text = await response.text();
  let payload: unknown = null;
  if (text) {
    try {
      payload = JSON.parse(text) as unknown;
    } catch {
      payload = null;
    }
  }
  if (!response.ok) {
    const code =
      payload && typeof payload === 'object' && 'error' in payload
        ? String(payload.error)
        : 'server_error';
    throw new ApiError(response.status, code);
  }
  return payload;
}

function validate<T>(guard: (value: unknown) => value is T, value: unknown): T {
  if (!guard(value)) throw new ApiError(502, 'invalid_response');
  return value;
}

export async function fetchAir(lat: number, lon: number) {
  const url = `/api/air?lat=${lat.toFixed(2)}&lon=${lon.toFixed(2)}`;
  const payload = await requestJson(url);
  return validate(isAirResponse, payload);
}

export async function searchCities(query: string) {
  const payload = await requestJson(`/api/geocode?q=${encodeURIComponent(query)}`);
  return validate(isGeocodeResponse, payload).results;
}

export async function requestPlan(
  input: {
    profile: Profile;
    lat: number;
    lon: number;
    sample?: boolean;
  },
  /** Lets the UI cancel a slow generation and show the local fallback plan. */
  signal?: AbortSignal,
) {
  const payload = await requestJson('/api/plan', {
    method: 'POST',
    body: JSON.stringify(input),
    signal,
  });
  return validate(isPlanResponse, payload);
}

/**
 * Ask one of the fixed quick questions. The body carries the enum, never free
 * text, so the server can validate it before any model call.
 */
export async function requestAnswer(
  input: {
    profile: Profile;
    lat: number;
    lon: number;
    sample?: boolean;
    question: AskQuestion;
  },
  signal?: AbortSignal,
) {
  const payload = await requestJson('/api/plan', {
    method: 'POST',
    body: JSON.stringify(input),
    signal,
  });
  return validate(isAnswerResponse, payload);
}
