// contacts.validators.ts

import { z } from 'zod';

/** E.164: accepts +34... or 34...; normalizes to + prefix */
export const phoneE164 = z
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

export const createContactSchema = z.object({
  ownerUserId: z.string().uuid('Invalid ownerUserId'),
  name: z.string().min(1, 'Name is required'),
  phone: phoneE164,
  importSource: z.string().optional(),
  externalId: z.string().optional(),
});

export const updateContactSchema = z.object({
  name: z.string().min(1).optional(),
  socioNumbers: z.record(z.string(), z.string()).optional(),
  communicationLanguage: z.enum(['es', 'en']).optional(),
});

export const createContactListSchema = z.object({
  ownerUserId: z.string().uuid('Invalid ownerUserId'),
  name: z.string().min(1, 'Name is required'),
});

export const renameContactListSchema = z.object({
  name: z.string().min(1, 'Name is required'),
});

export const addListMemberSchema = z.object({
  contactId: z.string().uuid('Invalid contactId'),
});

export const reorderListMembersSchema = z.object({
  contactIds: z.array(z.string().uuid()).min(1),
});

export const ensureUserByPhoneSchema = z.object({
  phone: phoneE164,
  name: z.string().min(1, 'Name is required'),
});
