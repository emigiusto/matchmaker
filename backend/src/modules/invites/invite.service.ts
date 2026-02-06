// invite.service.ts
// -----------------
// Core domain logic for Invite management
//
// DESIGN PRINCIPLES:
// - Invites are the source of truth for all match creation and status transitions.
// - Notifications are always side effects, never domain state, and never block core logic.
// - No delivery logic (push, email, WhatsApp, etc) exists here—only storage of notification events.
// - No WhatsApp or messaging channel assumptions: all actions are explicit and auditable via API only.
// - No Player creation, no user registration, no side effects except Match creation (and explicit notifications).
// - Comments and code document all domain invariants and design decisions for clarity and maintainability.

import { prisma } from '../../prisma';
import type { Invite, Match } from '@prisma/client';
import { AppError } from '../../shared/errors/AppError';
import { InviteDTO } from './invite.types';
import { generateInviteToken, getInviteExpiration, isInviteExpired } from './invite.token';
import { isPending } from './invite.model';
import { createNotification } from '../notifications/notifications.service';
import { logger } from '../../config/logger';
import { AvailabilityService } from '../availability/availability.service';

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
     * - Sent: inviterUserId
     * - Received: availability.userId
     */
    static async listInvitesByUser(userId: string): Promise<InviteDTO[]> {
      // Defensive: fetch invites where user is inviter or owns the availability
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
  static async createInvite(inviterUserId: string, availabilityId: string): Promise<InviteDTO> {
    // Validate inviter and availability
    const [user, availability] = await Promise.all([
      prisma.user.findUnique({ where: { id: inviterUserId } }),
      prisma.availability.findUnique({ where: { id: availabilityId } }),
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
        availabilityId,
        inviterUserId,
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
   * Confirm an invite (via token only)
   * - Invariant: A Match is never created twice for the same Invite
   * - All status transitions are explicit and safe (pending → accepted only)
   * - Transactional: prevents race conditions
   */
  static async confirmInvite(token: string): Promise<InviteDTO> {
    // All domain state changes (match creation, invite status) MUST happen inside the transaction.
    // No notification logic is allowed inside the $transaction callback. This ensures atomicity and prevents side effects from leaking into domain state.
    // Notification creation is a pure side effect and always happens strictly after the transaction completes.
    // No notification logic is ever run inside a Prisma transaction.
    let scheduledAt: Date | string | undefined;
    let availabilityId: string | undefined;
    const updatedInviteDTO = await prisma.$transaction(async (tx) => {
      const invite = await tx.invite.findUnique({ where: { token } });
      if (!invite) throw new AppError('Invite not found', 404);
      if (!isPending(invite)) throw new AppError('Invite is not pending', 409);
      if (isInviteExpired(invite.expiresAt)) {
        // Defensive: auto-expire and prevent match creation
        if (invite.status !== 'expired') {
          await tx.invite.update({ where: { id: invite.id }, data: { status: 'expired' } });
        }
        throw new AppError('Invite has expired', 410);
      }
      // Invariant: A Match must not already exist for this invite
      // Defensive: Match creation is only allowed for valid, pending, unexpired invites
      // Use the startTime from the linked Availability for scheduledAt
      const availability = await tx.availability.findUnique({ where: { id: invite.availabilityId } });
      if (!availability) throw new AppError('Availability not found', 404);
      scheduledAt = availability.startTime;
      availabilityId = availability.id;
      const match = await tx.match.create({
        data: {
          inviteId: invite.id,
          availabilityId: invite.availabilityId,
          scheduledAt: availability.startTime,
        },
      });
      // Update invite status and link match (use match relation, not matchId field)
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
   * Decline an invite (via token only)
   * - Invariant: Only pending invites can be declined (pending → declined)
   * - No match is created
   * - Transactional safety not strictly required, but could be added if needed
   */
  static async declineInvite(token: string): Promise<InviteDTO> {
    // All domain state changes (invite status) MUST happen before any notification logic.
    // No notification logic is allowed inside the transaction or before status update.
    // Notification creation is a pure side effect and always happens strictly after the status update completes.
    // No notification logic is ever run inside a Prisma transaction.
    const invite = await prisma.invite.findUnique({ where: { token } });
    if (!invite) throw new AppError('Invite not found', 404);
    if (!isPending(invite)) throw new AppError('Invite is not pending', 409);
    if (isInviteExpired(invite.expiresAt)) throw new AppError('Invite has expired', 410);
    // Invariant: Only pending → declined allowed
    const updatedInvite = await prisma.invite.update({
      where: { id: invite.id },
      data: { status: 'declined' },
    });

    // --- Optional notification side effect ---
    // All notification logic MUST happen strictly after the status update completes.
    // Decline notifications are not required for core domain correctness,
    // but can be useful for user feedback. They are optional and must not block
    // the decline flow. No match is created, and only the inviter is notified.
    // The invitee is NOT notified of their own decline.
    // No WhatsApp, push, or delivery logic is present—only event storage.
    // Fire-and-forget async IIFEs are avoided for clarity and error visibility.
    // Notification is still non-blocking and does not affect domain state.
    try {
      await createNotification(
        updatedInvite.inviterUserId,
        'invite.declined',
        buildInviteNotificationPayload({ inviteId: updatedInvite.id })
      );
    } catch (err) {
      logger.error('Failed to create invite.declined notification', {
        inviteId: updatedInvite.id,
        error: err instanceof Error ? err.message : err
      });
    }

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
    };
  }
}

// Helper to normalize notification payloads for invites
function buildInviteNotificationPayload(opts: { inviteId: string; matchId?: string | null; scheduledAt?: Date | string | null }): Record<string, unknown> {
  const payload: Record<string, unknown> = { inviteId: opts.inviteId };
  if (opts.matchId) payload.matchId = opts.matchId;
  if (opts.scheduledAt) payload.scheduledAt = typeof opts.scheduledAt === 'string' ? opts.scheduledAt : opts.scheduledAt.toISOString();
  return payload;
}