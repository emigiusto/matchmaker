// invite.types.ts
// ---------------
// API-facing types for Invite module (no Prisma models exposed)

import { MatchType } from "../matches/matches.types";


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
export type InviteStatus = 'pending' | 'accepted' | 'cancelled' | 'expired';

export type InviteVisibility = 'private' | 'community';

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
  /** Visibility: private or community */
  visibility: InviteVisibility;
  /** Optional minimum level filter */
  minLevel?: number | null;
  /** Optional maximum level filter */
  maxLevel?: number | null;
  /** Optional distance radius in km */
  radiusKm?: number | null;
  /** Match type: competitive or practice */
  matchType: MatchType;
  /** Whether to auto-book a court when the invite is accepted */
  bookingEnabled: boolean;
  /** Location from availability (when included) */
  location?: string;
  /** Date from availability YYYY-MM-DD (when included) */
  date?: string;
  /** Time from availability HH:mm (when included) */
  time?: string;
  /** Inviter display name (when included) */
  fromPlayerName?: string;
  /** Inviter player level (when included) */
  fromPlayerLevel?: number;
  /** Inviter player city (when included) */
  fromPlayerCity?: string;
}

/**
 * Input for creating an invite
 */
export interface CreateInviteInput {
  availabilityId: string;
  inviterUserId: string;
  matchType?: MatchType;
  bookingEnabled?: boolean;
}
