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

import { prisma } from '../../prisma';
import { AppError } from '../../shared/errors/AppError';
import { FriendshipDTO } from './friendships.types';
import { Friendship as PrismaFriendship, User as PrismaUser, GuestContact as PrismaGuestContact } from '@prisma/client';

/**
 * Normalized friend output type for listFriends
 */
export type Friend =
  | { type: 'user'; id: string; name: string; phone?: string }
  | { type: 'guestContact'; id: string; name: string; phone?: string };


export class FriendshipsService {
    /**
     * Get a specific friendship by ID
     */
    static async getFriendshipById(friendshipId: string): Promise<FriendshipDTO | null> {
      const friendship = await prisma.friendship.findUnique({ where: { id: friendshipId } });
      return friendship ? FriendshipsService.toDTO(friendship) : null;
    }

    /**
     * List mutual friends between two users
     */
    static async listMutualFriends(userId: string, otherUserId: string): Promise<Friend[]> {
      const friendsA = await FriendshipsService.listFriends(userId);
      const friendsB = await FriendshipsService.listFriends(otherUserId);
      const key = (f: Friend) => `${f.type}:${f.id}`;
      const setA = new Set(friendsA.map(key));
      return friendsB.filter(f => setA.has(key(f)));
    }

    /**
     * List incoming/outgoing friend requests (future extension)
     * Currently returns empty array (no status field yet)
     */
    static async listFriendRequests(userId: string): Promise<any[]> {
      return [];
    }

    /**
     * Check if two users are friends
     */
    static async isFriend(userId: string, otherUserId: string): Promise<boolean> {
      const friends = await FriendshipsService.listFriends(userId);
      return friends.some(f => f.type === 'user' && f.id === otherUserId);
    }

    /**
     * Get friend count for a user
     */
    static async countFriends(userId: string): Promise<number> {
      const friends = await FriendshipsService.listFriends(userId);
      return friends.length;
    }
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
    const outgoingNormalized: Friend[] = outgoing
      .filter(f => (f.friendUserId && f.friendUser) || (f.guestContactId && f.guestContact))
      .map(f => {
        if (f.friendUserId && f.friendUser) {
          const friendUser = f.friendUser as PrismaUser;
          const name = friendUser.name ?? friendUser.id;
          return { type: 'user', id: f.friendUserId, name, phone: friendUser.phone ?? undefined };
        } else if (f.guestContactId && f.guestContact) {
          const guestContact = f.guestContact as PrismaGuestContact;
          const name = guestContact.name ?? guestContact.id;
          return { type: 'guestContact', id: f.guestContactId, name, phone: guestContact.phone ?? undefined };
        }
        // Should never reach here due to filter
        throw new Error('Invalid friendship normalization');
      });

    // Normalize incoming (only users)
    const incomingNormalized: Friend[] = incoming
      .filter(f => !!f.user)
      .map(f => {
        const user = f.user as PrismaUser;
        const name = user.name ?? user.id;
        return { type: 'user', id: user.id, name, phone: user.phone ?? undefined };
      });

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

  private static toDTO(friendship: PrismaFriendship): FriendshipDTO {
    return {
      id: friendship.id,
      userId: friendship.userId,
      friendUserId: friendship.friendUserId ?? null,
      guestContactId: friendship.guestContactId ?? null,
      createdAt: friendship.createdAt instanceof Date ? friendship.createdAt.toISOString() : String(friendship.createdAt),
    };
  }
}
