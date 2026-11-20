import { z } from 'zod';

/** Response contracts, validated on the client too (never trust a response). */

export const airPointSchema = z
  .object({
    time: z.string(),
    usAqi: z.number().nullable(),
    pm25: z.number().nullable(),
    pm10: z.number().nullable(),
    no2: z.number().nullable(),
    o3: z.number().nullable(),
  })
  .strict();

export const airSnapshotSchema = z
  .object({
    lat: z.number(),
    lon: z.number(),
    timezone: z.string(),
    fetchedAt: z.string(),
    current: airPointSchema,
    history: z.array(airPointSchema),
    forecast: z.array(airPointSchema),
    source: z.string(),
    isSample: z.boolean(),
  })
  .strict();

export const derivedSchema = z
  .object({
    usAqi: z.number(),
    usBand: z.enum(['good', 'moderate', 'usg', 'unhealthy', 'veryUnhealthy', 'hazardous']),
    naqi: z
      .object({
        value: z.number(),
        band: z.enum(['good', 'satisfactory', 'moderate', 'poor', 'veryPoor', 'severe']),
        dominantPollutant: z.enum(['pm25', 'pm10', 'no2', 'o3']),
        subIndices: z.record(z.string(), z.number()),
      })
      .strict(),
    severity: z.enum([
      'good',
      'moderate',
      'sensitive',
      'unhealthy',
      'veryUnhealthy',
      'hazardous',
    ]),
    changeSinceYesterday: z.number().nullable(),
  })
  .strict();

export const airResponseSchema = z
  .object({ air: airSnapshotSchema, indices: derivedSchema })
  .strict();

export const geocodeResponseSchema = z
  .object({
    results: z.array(
      z
        .object({
          id: z.number(),
          name: z.string(),
          country: z.string(),
          admin1: z.string().optional(),
          lat: z.number(),
          lon: z.number(),
          timezone: z.string(),
        })
        .strict(),
    ),
  })
  .strict();

export type AirResponse = z.infer<typeof airResponseSchema>;
export type GeocodeResponse = z.infer<typeof geocodeResponseSchema>;
