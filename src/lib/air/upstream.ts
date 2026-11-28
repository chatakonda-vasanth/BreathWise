import { z } from 'zod';
import {
  AIR_QUALITY_HOST,
  GEOCODING_HOST,
  UPSTREAM_TIMEOUT_MS,
} from '@/lib/shared/constants';

const nullableNumber = z.number().nullable().optional();

const hourlySchema = z.object({
  time: z.array(z.string()).max(500),
  pm2_5: z.array(nullableNumber).max(500),
  pm10: z.array(nullableNumber).max(500),
  nitrogen_dioxide: z.array(nullableNumber).max(500),
  ozone: z.array(nullableNumber).max(500),
  us_aqi: z.array(nullableNumber).max(500),
});

const currentSchema = z.object({
  time: z.string().min(10).max(40),
  pm2_5: nullableNumber,
  pm10: nullableNumber,
  nitrogen_dioxide: nullableNumber,
  ozone: nullableNumber,
  us_aqi: nullableNumber,
});

const airResponseSchema = z.object({
  timezone: z.string().min(1).max(60),
  current: currentSchema.optional(),
  hourly: hourlySchema,
});

const geocodeResponseSchema = z.object({
  results: z
    .array(
      z.object({
        id: z.number(),
        name: z.string().max(120),
        country: z.string().max(80).optional(),
        admin1: z.string().max(120).optional(),
        latitude: z.number(),
        longitude: z.number(),
        timezone: z.string().max(60).optional(),
      }),
    )
    .max(20)
    .optional(),
});

export function num(value: number | null | undefined): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

export class UpstreamError extends Error {
  constructor() {
    super('upstream_unavailable');
    this.name = 'UpstreamError';
  }
}

export async function fetchJson(url: string): Promise<unknown> {
  let response: Response;
  try {
    response = await fetch(url, {
      method: 'GET',
      headers: { accept: 'application/json' },
      // Never follow a redirect away from the allow-listed host.
      //
      // `redirect: 'error'` is a Node-only extension: workerd (Cloudflare
      // Workers / OpenNext) throws "Invalid redirect value" before the request
      // is made, which turned every live lookup into a 502 in production.
      // 'manual' is portable and keeps the same guarantee — a 3xx response is
      // surfaced instead of followed, and rejected just below.
      redirect: 'manual',
      cache: 'no-store',
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    });
  } catch {
    throw new UpstreamError();
  }
  if (response.status >= 300 && response.status < 400) throw new UpstreamError();
  if (!response.ok) throw new UpstreamError();
  try {
    return (await response.json()) as unknown;
  } catch {
    throw new UpstreamError();
  }
}

/**
 * Upstream air-quality URL for coordinates already
 * rounded to two decimals. Kept separate from the fetch so it is testable.
 */
export function buildAirUrl(lat: number, lon: number): string {
  const url = new URL('/v1/air-quality', AIR_QUALITY_HOST);
  url.searchParams.set('latitude', lat.toFixed(2));
  url.searchParams.set('longitude', lon.toFixed(2));
  url.searchParams.set('current', 'pm2_5,pm10,nitrogen_dioxide,ozone,us_aqi');
  url.searchParams.set('hourly', 'pm2_5,pm10,nitrogen_dioxide,ozone,us_aqi');
  url.searchParams.set('past_days', '1');
  url.searchParams.set('forecast_days', '2');
  url.searchParams.set('timezone', 'auto');
  return url.toString();
}

/**
 * Upstream geocoding URL for an already validated query.
 */
export function buildGeocodeUrl(query: string): string {
  const url = new URL('/v1/search', GEOCODING_HOST);
  url.searchParams.set('name', query);
  url.searchParams.set('count', '6');
  url.searchParams.set('language', 'en');
  url.searchParams.set('format', 'json');
  return url.toString();
}

export type AirPayload = z.infer<typeof airResponseSchema>;
export type GeocodePayload = z.infer<typeof geocodeResponseSchema>;
export { airResponseSchema, geocodeResponseSchema };
