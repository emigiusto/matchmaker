// players.validators.ts
// ---------------------
// Zod schemas for Player-related validation

import { z } from 'zod';

// Reasonable bounds for levelValue
const LEVEL_MIN = 0;
const LEVEL_MAX = 10;

/**
 * Schema for validating playerId param (e.g., in route params)
 */
export const playerIdParamSchema = z.object({
  playerId: z.string().uuid(),
});

/**
 * Schema for creating a Player
 * TODO: Add stricter validation for displayName, preferredSurfaces, etc.
 */
export const createPlayerSchema = z.object({
  userId: z.string().uuid(),
  displayName: z.string().min(1).optional(), // Optional, but if present, must not be empty
  levelValue: z.number().min(LEVEL_MIN).max(LEVEL_MAX).optional(),
  levelConfidence: z.number().min(0).max(1).optional(),
  preferredSurfaces: z.array(z.string()).optional(),
  defaultCity: z.string().optional(),
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
});

/**
 * Schema for updating a Player (all fields optional)
 * TODO: Add stricter validation for displayName, preferredSurfaces, etc.
 */
export const updatePlayerSchema = z.object({
  displayName: z.string().min(1).optional(),
  levelValue: z.number().min(LEVEL_MIN).max(LEVEL_MAX).optional(),
  levelConfidence: z.number().min(0).max(1).optional(),
  preferredSurfaces: z.array(z.string()).optional(),
  defaultCity: z.string().optional(),
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
});
