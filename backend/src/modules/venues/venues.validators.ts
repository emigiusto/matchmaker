// venues.validators.ts
// Zod validators for the venues module

import { z } from 'zod';

export const createVenueSchema = z.object({
  name: z.string().min(1),
  city: z.string().min(1),
  address: z.string().min(1).nullable().optional(),
  indoor: z.boolean(),
  surface: z.string().min(1),
});

export const venueIdParamSchema = z.object({
  id: z.string().uuid(),
});

export const venueFiltersSchema = z.object({
  city: z.string().min(1).optional(),
  surface: z.string().min(1).optional(),
});
