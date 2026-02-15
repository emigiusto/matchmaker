// invite.service.ts
// -----------------
// Core domain logic for Invite management
//
// FINAL DOMAIN RULES & DESIGN PRINCIPLES:
//
// 1. Availability ownership
//    - Every Availability has exactly ONE owner (availability.userId).
//    - The availability owner is ALWAYS the inviter / host.
//    - This is NOT optional and must be documented clearly in comments.
//
// 2. Invite semantics
//    - An Invite is NOT "between two users".
//    - An Invite is a claim token for an Availability.
//    - The inviterUserId on Invite MUST always equal availability.userId.
//    - The invitee is NOT known at invite creation time.
//
// 3. Invitee definition (CRITICAL)
//    - The invitee is WHOEVER clicks the invite link and confirms it.
//    - The invitee may be:
//        - a guest
//        - a registered user
//        - a user with a Player
//    - The invitee is NOT the availability owner.
//
// 4. Match creation
//    - A Match is created ONLY by accepting an Invite.
//    - No Match is ever created directly from Availability.
//    - One Match per Invite. Never more.
//
// 5. Player attachment is BEST-EFFORT and NON-BLOCKING
//    - Never create Players implicitly.
//    - Never fail match creation due to missing Players.
//
// 6. Player roles in Match
//    - playerAId = Player of the availability owner (host), if exists
//    - playerBId = Player of the invite acceptor (opponent), if known
//    - At most ONE of playerAId / playerBId may be null
//    - Both may be null only in guest-vs-guest scenarios
//
// 7. Current limitation (IMPORTANT)
//    - The system does NOT yet track who accepted the invite.
//    - Therefore:
//        - playerAId MAY be attached (availability owner)
//        - playerBId will often be null
//    - This is EXPECTED and CORRECT.
//    - Document this explicitly in comments to avoid future confusion.
//
// 8. Comments and code document all domain invariants and design decisions for clarity and maintainability.

import { prisma } from '../../prisma';
import type { Invite, Match, Player } from '@prisma/client';
import { AppError } from '../../shared/errors/AppError';
import { CreateInviteInput, InviteDTO } from './invite.types';
import { generateInviteToken, getInviteExpiration, isInviteExpired } from './invite.token';
import { isPending } from './invite.model';
import { createNotification } from '../notifications/notifications.service';
import { logger } from '../../config/logger';
import { AvailabilityService } from '../availabilities/availability.service';

export class InviteService {
  /**
   * Get invite by ID
   */
  static async getInviteById(inviteId: string): Promise<InviteDTO | null> {
    const invite = await prisma.invite.findUnique({ where: { id: inviteId } });
    if (!invite) return null;
    return InviteService.toDTO(invite);
  }

  /**
   * List all invites sent or received by a user
   * - Sent: inviterUserId (user is the host/owner of the availability)
   * - Received: user is the owner of an availability for which an invite exists
   *   (Note: Invitee is not known until invite is accepted)
   */
  static async listInvitesByUser(userId: string): Promise<InviteDTO[]> {
    // Defensive: fetch invites where user is inviter (host) or owns the availability
    const invites = await prisma.invite.findMany({
      where: {
        OR: [
          { inviterUserId: userId },
          { availability: { userId } },
        ],
      },
      include: { availability: true, match: true },
      orderBy: { createdAt: 'desc' },
    });
    return invites.map(InviteService.toDTO);
  }

  /**
   * List all invites for an availability
   */
  static async listInvitesByAvailability(availabilityId: string): Promise<InviteDTO[]> {
    const invites = await prisma.invite.findMany({
      where: { availabilityId },
      include: { match: true },
      orderBy: { createdAt: 'desc' },
    });
    return invites.map(InviteService.toDTO);
  }

  /**
   * Count invites for a user (sent or received)
   */
  static async countInvitesByUser(userId: string): Promise<number> {
    return prisma.invite.count({
      where: {
        OR: [
          { inviterUserId: userId },
          { availability: { userId } },
        ],
      },
    });
  }
  /**
   * Create an invite for an availability, by a user
   * - Only a User can create an invite
   * - Token is generated and is the source of truth
   */
  static async createInvite(createInviteInput: CreateInviteInput): Promise<InviteDTO> {
    // Validate inviter and availability
    const [user, availability] = await Promise.all([
      prisma.user.findUnique({ where: { id: createInviteInput.inviterUserId } }),
      prisma.availability.findUnique({ where: { id: createInviteInput.availabilityId } }),
    ]);
    if (!user) throw new AppError('Inviter user not found', 404);
    if (!availability) throw new AppError('Availability not found', 404);
    // Generate token and expiration
    const token = generateInviteToken();
    const expiresAt = getInviteExpiration();
    // Create invite
    const invite = await prisma.invite.create({
      data: {
        token,
        status: 'pending',
        expiresAt,
        availabilityId: createInviteInput.availabilityId,
        inviterUserId: createInviteInput.inviterUserId,
      },
    });
    return InviteService.toDTO(invite);
  }

  /**
   * Get invite by token (link is the only source of truth)
   * - If invite is expired, auto-update status to expired and return
   * - Defensive: ensures frontend always sees correct status
   */
  static async getInviteByToken(token: string): Promise<InviteDTO> {
    const invite = await prisma.invite.findUnique({ where: { token } });
    if (!invite) throw new AppError('Invite not found', 404);
    if (isInviteExpired(invite.expiresAt) && invite.status !== 'expired') {
      // Defensive: auto-expire if needed
      // --- Expiration is always silent: NO notifications are ever sent for expired invites. ---
      // This is intentional: expiration is a background/system event, not a user action.
      const updated = await prisma.invite.update({ where: { id: invite.id }, data: { status: 'expired' } });
      return InviteService.toDTO(updated);
    }
    return InviteService.toDTO(invite);
  }

  /**
   * Confirm an invite (via token and acceptor identity)
   * - Validates invite, user, and invite conditions (level, distance, etc).
   * - Guest users without a player cannot accept invites with level/distance conditions.
   * - Creates a match and updates invite/availability atomically.
   * - Emits notification after transaction.
   */
  static async confirmInvite(token: string, acceptorUserId: string): Promise<InviteDTO> {
    let scheduledAt: Date | string | undefined;
    let availabilityId: string | undefined;
    const updatedInviteDTO = await prisma.$transaction(async (tx) => {
      const invite = await tx.invite.findUnique({ where: { token } });
      if (!invite) throw new AppError('Invite not found', 404);
      if (!isPending(invite)) throw new AppError('Invite is not pending', 409);
      if (isInviteExpired(invite.expiresAt)) {
        if (invite.status !== 'expired') {
          await tx.invite.update({ where: { id: invite.id }, data: { status: 'expired' } });
        }
        throw new AppError('Invite has expired', 410);
      }
      const availability = await tx.availability.findUnique({ where: { id: invite.availabilityId } });
      if (!availability) throw new AppError('Availability not found', 404);
      scheduledAt = availability.startTime;
      availabilityId = availability.id;

      // Validate acceptor user
      const acceptorUser = await tx.user.findUnique({ where: { id: acceptorUserId } });
      if (!acceptorUser) throw new AppError('Invite acceptor user not found', 404);
      const resolvedOpponentUserId = acceptorUser.id;

      // Attach players
      let playerAId: string | null = null;
      let playerBId: string | null = null;
      const hostPlayer: Player | null = availability.userId
        ? await tx.player.findFirst({ where: { userId: availability.userId } })
        : null;
      if (hostPlayer) playerAId = hostPlayer.id;
      const opponentPlayer: Player | null = resolvedOpponentUserId
        ? await tx.player.findFirst({ where: { userId: resolvedOpponentUserId } })
        : null;
      if (opponentPlayer) playerBId = opponentPlayer.id;

      // --- Invite condition validation ---
      InviteService.validateInviteConditions(invite, hostPlayer, opponentPlayer);

      const match = await tx.match.create({
        data: {
          inviteId: invite.id,
          availabilityId: invite.availabilityId,
          scheduledAt: availability.startTime,
          hostUserId: availability.userId,
          opponentUserId: resolvedOpponentUserId,
          playerAId,
          playerBId,
        },
      });
      const updatedInvite = await tx.invite.update({
        where: { id: invite.id },
        data: {
          status: 'accepted',
          match: { connect: { id: match.id } },
        },
        include: { match: true },
      });
      return InviteService.toDTO(updatedInvite);
    });

    // --- Mark the related availability as matched ---
    if (availabilityId) {
      try {
        await AvailabilityService.markAvailabilityAsMatched(availabilityId);
      } catch (err) {
        logger.error('Failed to mark availability as matched', {
          availabilityId,
          error: err instanceof Error ? err.message : err
        });
      }
    }

    // --- Notification is a side effect, not domain state ---
    // All notification logic MUST happen strictly after the transaction completes.
    // If notification creation fails, the match and invite are still committed.
    // scheduledAt is included in the notification payload for UI convenience (e.g., calendar display, reminders).
    // It is always a timestamp, never a full object.
    // No WhatsApp, push, or delivery logic is present—only event storage.
    try {
      await createNotification(
        updatedInviteDTO.inviterUserId,
        'invite.accepted',
        buildInviteNotificationPayload({
          inviteId: updatedInviteDTO.id,
          matchId: updatedInviteDTO.matchId,
          scheduledAt,
        })
      );
    } catch (err) {
      logger.error('Failed to create invite.accepted notification', {
        inviteId: updatedInviteDTO.id,
        error: err instanceof Error ? err.message : err
      });
    }

    return updatedInviteDTO;
  }

  /**
 * Cancel an invite (by inviter only)
 * - Only inviterUserId can cancel
 * - Only pending invites can be cancelled
 * - Idempotent: if already cancelled, returns as is
 * - No match is created
 * - No notifications are sent
 */
  static async cancelInvite(inviteId: string, userId: string): Promise<InviteDTO> {
    const invite = await prisma.invite.findUnique({ where: { id: inviteId } });
    if (!invite) throw new AppError('Invite not found', 404);
    if (invite.inviterUserId !== userId) throw new AppError('Only the inviter can cancel this invite', 403);
    if (invite.status === 'cancelled') return InviteService.toDTO(invite);
    if (invite.status !== 'pending') return InviteService.toDTO(invite); // Only pending can be cancelled
    const updatedInvite = await prisma.invite.update({
      where: { id: inviteId },
      data: { status: 'cancelled' },
    });
    return InviteService.toDTO(updatedInvite);
  }


  /**
   * Expire an invite (sets status to expired)
   * - Invariant: Only pending invites can be expired (pending → expired)
   * - Can be run by cron safely (idempotent)
   */
  static async expireInvite(inviteId: string): Promise<InviteDTO> {
    const invite = await prisma.invite.findUnique({ where: { id: inviteId } });
    if (!invite) throw new AppError('Invite not found', 404);
    if (invite.status === 'expired') return InviteService.toDTO(invite);
    if (invite.status !== 'pending') return InviteService.toDTO(invite); // Only pending can be expired
    // --- Expiration is always silent: NO notifications are ever sent for expired invites. ---
    // This is intentional: expiration is a background/system event, not a user action.
    // No notification, delivery, or messaging logic is ever triggered by expiration.
    // Users are not notified to avoid noise and confusion. Only explicit declines/accepts notify.
    const updatedInvite = await prisma.invite.update({
      where: { id: inviteId },
      data: { status: 'expired' },
    });
    return InviteService.toDTO(updatedInvite);
  }

  /**
   * Convert Invite to DTO (API shape)
   * Never exposes internal Prisma models to controllers.
   */
  private static toDTO(invite: Invite & { match?: Match | null }): InviteDTO {
    return {
      id: invite.id,
      token: invite.token,
      status: invite.status,
      expiresAt: invite.expiresAt instanceof Date ? invite.expiresAt.toISOString() : invite.expiresAt,
      createdAt: invite.createdAt instanceof Date ? invite.createdAt.toISOString() : invite.createdAt,
      availabilityId: invite.availabilityId,
      inviterUserId: invite.inviterUserId,
      matchId: invite.match?.id ?? null,
      visibility: invite.visibility,
      minLevel: typeof invite.minLevel === 'number' ? invite.minLevel : null,
      maxLevel: typeof invite.maxLevel === 'number' ? invite.maxLevel : null,
      radiusKm: typeof invite.radiusKm === 'number' ? invite.radiusKm : null,
    };
  }

  /**
   * Validate invite conditions (level, distance, etc) for the acceptor and opponent player.
   * Throws AppError if any condition is not met.
   *
   * - If invite has minLevel/maxLevel, opponent must have a player with levelValue in range
   * - If invite has radiusKm, opponent must have a player with location
   * - Guests without a player cannot accept invites with level/distance conditions
   */
  private static validateInviteConditions(invite: Invite, hostPlayer: Player | null, opponentPlayer: Player | null) {
    // Level conditions
    if ((invite.minLevel != null || invite.maxLevel != null) && !opponentPlayer) {
      throw new AppError('A guest user without a player cannot accept an invite with level conditions', 403);
    }
    if (opponentPlayer && (invite.minLevel != null || invite.maxLevel != null)) {
      const level = opponentPlayer.levelValue;
      if (invite.minLevel != null && (level == null || level < invite.minLevel)) {
        throw new AppError('Player level is below the minimum required', 403);
      }
      if (invite.maxLevel != null && (level == null || level > invite.maxLevel)) {
        throw new AppError('Player level is above the maximum allowed', 403);
      }
    }
    // Distance conditions
    if (invite.radiusKm != null && !opponentPlayer) {
      throw new AppError('A guest user without a player cannot accept an invite with distance conditions', 403);
    }
    if (opponentPlayer && invite.radiusKm != null) {
      if (hostPlayer && opponentPlayer.latitude != null && opponentPlayer.longitude != null && hostPlayer.latitude != null && hostPlayer.longitude != null) {
        const toRad = (v: number) => (v * Math.PI) / 180;
        const R = 6371; // Earth radius in km
        const dLat = toRad(opponentPlayer.latitude - hostPlayer.latitude);
        const dLon = toRad(opponentPlayer.longitude - hostPlayer.longitude);
        const lat1 = toRad(hostPlayer.latitude);
        const lat2 = toRad(opponentPlayer.latitude);
        const a = Math.sin(dLat / 2) ** 2 + Math.sin(dLon / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        const distance = R * c;
        if (distance > invite.radiusKm) {
          throw new AppError('Player is outside the allowed distance', 403);
        }
      } else {
        throw new AppError('Player location is required for distance validation', 403);
      }
    }
  }
}

// Helper to normalize notification payloads for invites
function buildInviteNotificationPayload(opts: { inviteId: string; matchId?: string | null; scheduledAt?: Date | string | null }): Record<string, unknown> {
  const payload: Record<string, unknown> = { inviteId: opts.inviteId };
  if (opts.matchId) payload.matchId = opts.matchId;
  if (opts.scheduledAt) payload.scheduledAt = typeof opts.scheduledAt === 'string' ? opts.scheduledAt : opts.scheduledAt.toISOString();
  return payload;
}