// results.validators.ts
// Zod validators for the results module
//
// Does NOT validate tennis rules (e.g. 6 games, win by 2). Only basic shape and value checks.
// TODO: Add tennis-specific validation in the future.

import { z } from 'zod';

export const uuidSchema = z.string().uuid();

export const matchIdParamSchema = z.object({
  matchId: uuidSchema,
});

export const resultIdParamSchema = z.object({
  resultId: uuidSchema,
});

export const addSetResultSchema = z.object({
  setNumber: z.number().int().min(1),
  playerAScore: z.number().int().min(0),
  playerBScore: z.number().int().min(0),
  tiebreakScoreA: z.number().int().min(0).nullable().optional(),
  tiebreakScoreB: z.number().int().min(0).nullable().optional(),
});

export const createResultSchema = z.object({
  matchId: uuidSchema,
  winnerPlayerId: uuidSchema.nullable(),
  sets: z.array(addSetResultSchema),
});
