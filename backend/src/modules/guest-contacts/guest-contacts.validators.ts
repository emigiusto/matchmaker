// guest-contacts.validators.ts
// Zod validators for GuestContact

import { z } from 'zod';

export const createGuestContactSchema = z.object({
  ownerUserId: z.string().uuid('Invalid ownerUserId'),
  name: z.string().min(1, 'Name is required'),
  phone: z.string().min(1, 'Phone is required'),
});

export const ensureUserByPhoneSchema = z.object({
  phone: z.string().min(1, 'Phone is required'),
  name: z.string().min(1, 'Name is required'),
});
