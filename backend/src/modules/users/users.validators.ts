import { z } from 'zod';

export const createUserSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  email: z.string().email('Invalid email').optional(),
  phone: z.string().optional(),
});

export const updateUserSchema = z.object({
  name: z.string().optional(),
  phone: z
    .string()
    .optional()
    .transform((v) => {
      if (!v || !v.trim()) return undefined;
      const digits = v.trim().replace(/\D/g, '');
      return digits ? `+${digits}` : undefined;
    })
    .refine(
      (v) =>
        v === undefined ||
        (v.startsWith('+') && /^\+\d+$/.test(v) && v.replace(/\D/g, '').length >= 8 && v.replace(/\D/g, '').length <= 15),
      'Phone must have 8–15 digits with country code (e.g. +34)',
    ),
});
// users.validators.ts
// Zod validators for User creation. Guest-first: phone is optional.

export const createGuestUserSchema = z.object({
  name: z.string().optional(),
  email: z.string().email('Invalid email').optional(),
  phone: z.string().optional(),
});