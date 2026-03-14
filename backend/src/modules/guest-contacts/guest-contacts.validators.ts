// guest-contacts.validators.ts
// Zod validators for GuestContact

import { z } from 'zod';

/** E.164: 8–15 digits. Accepts +34... or 34...; normalizes to + prefix. */
const phoneE164 = z
  .string()
  .min(1, 'Phone is required')
  .transform((v) => {
    const trimmed = v.trim();
    const digits = trimmed.replace(/\D/g, '');
    return digits ? `+${digits}` : trimmed;
  })
  .refine((v) => v.startsWith('+') && /^\+\d+$/.test(v), 'Phone must include country code (e.g. +34)')
  .refine((v) => {
    const digits = v.replace(/\D/g, '');
    return digits.length >= 8 && digits.length <= 15;
  }, 'Phone must have 8–15 digits');

export const createGuestContactSchema = z.object({
  ownerUserId: z.string().uuid('Invalid ownerUserId'),
  name: z.string().min(1, 'Name is required'),
  phone: phoneE164,
  socioNumber: z.string().optional(),
});

export const ensureUserByPhoneSchema = z.object({
  phone: phoneE164,
  name: z.string().min(1, 'Name is required'),
});
