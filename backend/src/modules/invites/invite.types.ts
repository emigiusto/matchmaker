// invite.types.ts
// ---------------
// API-facing types for Invite module (no Prisma models exposed)

/**
 * Invite-first flow:
 * - Invites are the entry point for joining a match or availability.
 * - The invite token is the source of truth for invite acceptance/confirmation.
 * - Token is always treated as opaque (never parsed or trusted for embedded data).
 */

/**
 * InviteStatus
 * Allowed status values for an invite.
 */
export type InviteStatus = 'pending' | 'accepted' | 'declined' | 'expired';

/**
 * InviteDTO
 * API-facing shape for an invite.
 */
export interface InviteDTO {
  /** Unique invite ID */
  id: string;
  /** Opaque token, never parsed */
  token: string;
  /** Invite status */
  status: InviteStatus;
  /** ISO datetime string */
  expiresAt: string;
  /** ISO datetime string */
  createdAt: string;
  /** Availability this invite is for */
  availabilityId: string;
  /** User who sent the invite */
  inviterUserId: string;
  /** Match created from this invite, if any */
  matchId?: string | null;
}

/**
 * Input for creating an invite
 */
export interface CreateInviteInput {
  availabilityId: string;
  inviterUserId: string;
  // Additional fields (e.g., invitee info) can be added as needed
}
