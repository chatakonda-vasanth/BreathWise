import { airResponseSchema, geocodeResponseSchema } from './apiSchemas';
import { planResponseSchema, type Profile } from './schemas';
import type { z } from 'zod';

/** Browser-side API access. Every response is validated before use. */

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
        ? String((payload as { error: unknown }).error)
        : 'server_error';
    throw new ApiError(response.status, code);
  }
  return payload;
}

function validate<T extends z.ZodType>(schema: T, value: unknown): z.infer<T> {
  const parsed = schema.safeParse(value);
  if (!parsed.success) throw new ApiError(502, 'invalid_response');
  return parsed.data;
}

export async function fetchAir(lat: number, lon: number) {
  const url = `/api/air?lat=${lat.toFixed(2)}&lon=${lon.toFixed(2)}`;
  const payload = await requestJson(url);
  return validate(airResponseSchema, payload);
}

export async function searchCities(query: string) {
  const payload = await requestJson(`/api/geocode?q=${encodeURIComponent(query)}`);
  return validate(geocodeResponseSchema, payload).results;
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
  return validate(planResponseSchema, payload);
}
