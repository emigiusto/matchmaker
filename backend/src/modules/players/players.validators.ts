// players.validators.ts
// ---------------------
// Zod schemas for Player-related validation

import { z } from 'zod';

// Bounds for ELO-based levelValue
const LEVEL_MIN = 0;
const LEVEL_MAX = 3000;

/**
 * Schema for validating playerId param (e.g., in route params)
 */
export const playerIdParamSchema = z.object({
  playerId: z.string().uuid(),
});

/**
 * Schema for creating a Player
 */
export const createPlayerSchema = z.object({
  userId: z.string().uuid(),
  levelValue: z.number().min(LEVEL_MIN).max(LEVEL_MAX).optional(),
  levelConfidence: z.number().min(0).max(1).optional(),
  preferredSurfaces: z.array(z.string()).optional(),
  defaultCity: z.string().optional(),
  preferredClub: z.string().optional(),
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
});

/**
 * Schema for updating a Player (all fields optional)
 */
export const updatePlayerSchema = z.object({
  levelValue: z.number().min(LEVEL_MIN).max(LEVEL_MAX).optional(),
  levelConfidence: z.number().min(0).max(1).optional(),
  preferredSurfaces: z.array(z.string()).optional(),
  defaultCity: z.string().optional(),
  preferredClub: z.string().optional(),
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
});
