// friendships.validators.ts
// -------------------------
// Zod schemas for Friendships module

import { z } from 'zod';

/**
 * TODO: Add support for friendship status (pending / accepted) in future.
 */

// Common ID validation
const idSchema = z.string().uuid();

/**
 * Schema for adding a user friend (registered user)
 * - userId and friendUserId must be different
 */
export const addUserFriendSchema = z.object({
  userId: idSchema,
  friendUserId: idSchema,
}).refine((data) => data.userId !== data.friendUserId, {
  message: 'userId and friendUserId must be different',
  path: ['friendUserId'],
});

/**
 * Schema for adding a guest contact as a friend
 * - guestContactId required
 */
export const addGuestContactFriendSchema = z.object({
  userId: idSchema,
  guestContactId: idSchema,
});

/**
 * Schema for friendshipId param (e.g., in route params)
 */
export const friendshipIdParamSchema = z.object({
  friendshipId: idSchema,
});

/**
 * Schema for listing friends (query params)
 * - Only one of friendUserId or guestContactId can be set
 */
export const listFriendsQuerySchema = z.object({
  userId: idSchema,
  friendUserId: idSchema.optional(),
  guestContactId: idSchema.optional(),
}).refine(
  (data) =>
    (data.friendUserId && !data.guestContactId) ||
    (!data.friendUserId && data.guestContactId) ||
    (!data.friendUserId && !data.guestContactId),
  {
    message: 'Exactly one of friendUserId or guestContactId can be set (or neither)',
    path: ['friendUserId', 'guestContactId'],
  }
);
