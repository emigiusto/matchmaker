// invite.service.ts
// -----------------
// Core domain logic for Invite management
//
// This module enforces the invite-first flow:
//
// - Invite links (tokens) are the only way to confirm/decline (no auth assumptions, no WhatsApp parsing)
// - No Player creation, no user registration, no side effects except Match creation
// - Messaging channels (e.g., WhatsApp replies) are ignored for security and auditability
// - All status transitions and match creation are strictly controlled
// - Comments and code document all domain invariants and intent

import { PrismaClient } from '@prisma/client';
import { AppError } from '../../shared/errors/AppError';
import { InviteDTO, InviteStatus } from './invite.types';
import { generateInviteToken, getInviteExpiration, isInviteExpired } from './invite.token';
import { isPending } from './invite.model';

const prisma = new PrismaClient();

export class InviteService {
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
    return await prisma.$transaction(async (tx) => {
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
  }

  /**
   * Decline an invite (via token only)
   * - Invariant: Only pending invites can be declined (pending → declined)
   * - No match is created
   * - Transactional safety not strictly required, but could be added if needed
   */
  static async declineInvite(token: string): Promise<InviteDTO> {
    const invite = await prisma.invite.findUnique({ where: { token } });
    if (!invite) throw new AppError('Invite not found', 404);
    if (!isPending(invite)) throw new AppError('Invite is not pending', 409);
    if (isInviteExpired(invite.expiresAt)) throw new AppError('Invite has expired', 410);
    // Invariant: Only pending → declined allowed
    const updatedInvite = await prisma.invite.update({
      where: { id: invite.id },
      data: { status: 'declined' },
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
  private static toDTO(invite: any): InviteDTO {
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
