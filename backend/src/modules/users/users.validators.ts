import { z } from 'zod';

export const createUserSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  phone: z.string().optional(),
});

export const updateUserSchema = z.object({
  name: z.string().optional(),
  phone: z.string().optional(),
});
// users.validators.ts
// Zod validators for User creation. Guest-first: phone is optional.

export const createGuestUserSchema = z.object({
  name: z.string().optional(),
  phone: z.string().optional(),
});