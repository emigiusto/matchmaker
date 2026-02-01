// availability.validators.ts
// --------------------------
// Zod schemas for Availability module

import { z } from 'zod';

/**
 * TODO: Add overlap detection for availabilities in the future.
 */

// Common ID validation
const idSchema = z.string().uuid();

/**
 * Schema for creating an availability slot
 * - startTime must be before endTime
 * - date must be a valid date
 * - minLevel <= maxLevel when both present
 * - locationText is required
 */
export const createAvailabilitySchema = z.object({
  userId: idSchema,
  date: z.string().refine((val) => !isNaN(Date.parse(val)), {
    message: 'Invalid date format',
  }),
  startTime: z.string(),
  endTime: z.string(),
  locationText: z.string().min(1, 'locationText is required'),
  minLevel: z.number().min(0).max(10).nullable().optional(),
  maxLevel: z.number().min(0).max(10).nullable().optional(),
}).refine((data) => {
  // startTime < endTime (lexical ISO time comparison)
  return data.startTime < data.endTime;
}, {
  message: 'startTime must be before endTime',
  path: ['endTime'],
}).refine((data) => {
  // minLevel <= maxLevel if both present
  if (data.minLevel != null && data.maxLevel != null) {
    return data.minLevel <= data.maxLevel;
  }
  return true;
}, {
  message: 'minLevel must be less than or equal to maxLevel',
  path: ['maxLevel'],
});

/**
 * Schema for availabilityId param (e.g., in route params)
 */
export const availabilityIdParamSchema = z.object({
  availabilityId: idSchema,
});

/**
 * Schema for listing availabilities (query params)
 */
export const listAvailabilitiesQuerySchema = z.object({
  userId: idSchema.optional(),
  date: z.string().optional(),
});
