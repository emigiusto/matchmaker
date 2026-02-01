// friendships.types.ts
// --------------------
// API-facing types for Friendships module (no Prisma models exposed)

/**
 * Explicit social graph:
 * - Each Friendship represents a directed edge (userId → friendUserId or guestContactId).
 * - Symmetry (mutual friendship) is handled in queries, not in the schema.
 *   This allows for explicit control over friend requests, blocks, etc.
 */

/**
 * FriendshipDTO
 * API-facing shape for a Friendship edge.
 * Exactly one of friendUserId or guestContactId is set.
 */
export interface FriendshipDTO {
  id: string;
  userId: string;
  friendUserId?: string | null; // Set if friend is a registered user
  guestContactId?: string | null; // Set if friend is a guest contact
  createdAt: string; // ISO date string
}

/**
 * Input for adding a user friend (registered user)
 */
export interface AddUserFriendInput {
  userId: string;
  friendUserId: string;
}

/**
 * Input for adding a guest contact as a friend
 */
export interface AddGuestContactFriendInput {
  userId: string;
  guestContactId: string;
}
