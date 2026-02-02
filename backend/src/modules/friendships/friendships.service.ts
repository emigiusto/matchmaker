// friendships.service.ts
// ----------------------
// Core logic for Friendships management
//
// This module manages the explicit social graph for users and guest contacts.
//
// - Each Friendship is a directed edge (userId → friendUserId or guestContactId).
// - Symmetry (mutual friendship) is handled in queries, not in storage.
//   This allows for explicit control over friend requests, blocks, etc.
// - No Prisma models are exposed to controllers; only DTOs are returned.
//
// Future extensions: friendship status (pending/accepted), acceptedAt, etc.

import { prisma } from '../../shared/prisma';
import { AppError } from '../../shared/errors/AppError';
import { FriendshipDTO } from './friendships.types';

/**
 * Normalized friend output type for listFriends
 */
export type Friend =
  | { type: 'user'; id: string; name: string; phone?: string }
  | { type: 'guestContact'; id: string; name: string; phone?: string };


export class FriendshipsService {
  /**
   * Add a friendship to a registered user
   * - No self-friendship
   * - Prevents duplicate friendships
   * - Only one of friendUserId or guestContactId is set
   */
  static async addUserFriend(userId: string, friendUserId: string): Promise<FriendshipDTO> {
    if (userId === friendUserId) throw new AppError('Cannot friend yourself', 400);
    // Check both users exist
    const [user, friend] = await Promise.all([
      prisma.user.findUnique({ where: { id: userId } }),
      prisma.user.findUnique({ where: { id: friendUserId } }),
    ]);
    if (!user) throw new AppError('User not found', 404);
    if (!friend) throw new AppError('Friend user not found', 404);
    // Prevent duplicate
    const existing = await prisma.friendship.findFirst({
      where: { userId, friendUserId, guestContactId: null },
    });
    if (existing) throw new AppError('Friendship already exists between these users', 409);
    // Create friendship (directional)
    const friendship = await prisma.friendship.create({
      data: { userId, friendUserId, guestContactId: null },
    });
    return FriendshipsService.toDTO(friendship);
  }

  /**
   * Add a friendship to a guest contact
   * - Prevents duplicate friendships
   * - Only one of friendUserId or guestContactId is set
   */
  static async addGuestContactFriend(userId: string, guestContactId: string): Promise<FriendshipDTO> {
    // Check user and guest contact exist
    const [user, guestContact] = await Promise.all([
      prisma.user.findUnique({ where: { id: userId } }),
      prisma.guestContact.findUnique({ where: { id: guestContactId } }),
    ]);
    if (!user) throw new AppError('User not found', 404);
    // Defensive: guest contact must belong to user
    if (!guestContact || guestContact.ownerUserId !== userId) throw new AppError('Guest contact not found or does not belong to user', 404);
    // Prevent duplicate
    const existing = await prisma.friendship.findFirst({
      where: { userId, guestContactId, friendUserId: null },
    });
    if (existing) throw new AppError('Friendship already exists with this guest contact', 409);
    // Create friendship (directional)
    const friendship = await prisma.friendship.create({
      data: { userId, guestContactId, friendUserId: null },
    });
    return FriendshipsService.toDTO(friendship);
  }

  /**
   * Remove a friendship by ID
   * - Idempotent: does not error if already deleted
   * - Only one record is removed
   */
  static async removeFriend(friendshipId: string): Promise<void> {
    // Defensive: only delete if exists, but do not error if not found (idempotent)
    const friendship = await prisma.friendship.findUnique({ where: { id: friendshipId } });
    if (!friendship) return; // Idempotent: no error if already deleted
    await prisma.friendship.delete({ where: { id: friendshipId } });
  }

  /**
   * List all friends (users and guest contacts) for a user
   * - Returns normalized output: type, id, name, phone?
   * - Symmetry is handled in query (returns both outgoing and incoming edges)
   * - If A adds B, B appears in A's friends; if B adds A, A appears in B's friends
   * - No reverse Friendship rows are created; schema is unchanged
   * - Output is deduplicated by (type, id)
   */
  static async listFriends(userId: string): Promise<Friend[]> {
    // Outgoing friendships (userId initiated)
    const outgoing = await prisma.friendship.findMany({
      where: { userId },
      include: { friendUser: true, guestContact: true },
    });
    // Incoming friendships (userId is the friendUserId)
    const incoming = await prisma.friendship.findMany({
      where: { friendUserId: userId },
      include: { user: true },
    });

    // Normalize outgoing
    const outgoingNormalized = outgoing.map(f => {
      if (f.friendUserId && f.friendUser) {
        // User: prefer displayName, fallback to name, then email, then id
        const name = (f.friendUser as any).displayName || (f.friendUser as any).name || (f.friendUser as any).email || f.friendUser.id;
        return { type: 'user', id: f.friendUserId, name, phone: (f.friendUser as any).phone ?? undefined };
      } else if (f.guestContactId && f.guestContact) {
        // GuestContact: prefer name, fallback to phone, then id
        const name = f.guestContact.name || f.guestContact.phone || f.guestContact.id;
        return { type: 'guestContact', id: f.guestContactId, name, phone: f.guestContact.phone ?? undefined };
      }
      return null;
    }).filter(Boolean) as Friend[];

    // Normalize incoming (only users)
    const incomingNormalized = incoming.map(f => {
      if (f.user) {
        // User: prefer displayName, fallback to name, then email, then id
        const name = (f.user as any).displayName || (f.user as any).name || (f.user as any).email || f.user.id;
        return { type: 'user', id: f.user.id, name, phone: (f.user as any).phone ?? undefined };
      }
      return null;
    }).filter(Boolean) as Friend[];

    // Merge and dedupe by (type, id)
    const seen = new Set<string>();
    const all = [...outgoingNormalized, ...incomingNormalized].filter(friend => {
      const key = `${friend.type}:${friend.id}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    return all;
  }

  /**
   * Convert Friendship to DTO
   * Ensures only one of friendUserId/guestContactId is set
   */

  private static toDTO(friendship: any): FriendshipDTO {
    return {
      id: friendship.id,
      userId: friendship.userId,
      friendUserId: friendship.friendUserId ?? null,
      guestContactId: friendship.guestContactId ?? null,
      createdAt: friendship.createdAt.toISOString(),
    };
  }
}
