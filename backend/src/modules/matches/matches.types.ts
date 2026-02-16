// matches.types.ts
// API-facing types for the matches module
//
// Match is a derived entity: it is only created via Invite confirmation (see Invites module) and is immutable.
// No creation or mutation logic here.

/**
 * MatchDTO represents a match entity exposed via the API.
 *
 * - Match is a derived entity, not created directly.
 * - Matches are created only via Invite confirmation (see Invites module).
 * - All references are by ID only (no embedded objects).
 * - Dates are ISO strings.
 * - No WhatsApp or external messaging logic.
 * 
 */
export type MatchStatus = 'scheduled' | 'awaiting_confirmation' | 'completed' | 'cancelled' | 'disputed';

export interface MatchDTO {
  id: string;
  inviteId: string | null;
  availabilityId: string | null;
  venueId: string | null;
  playerAId: string | null;
  playerBId: string | null;
  hostUserId: string;
  opponentUserId: string;
  scheduledAt: string; // ISO string
  createdAt: string;   // ISO string
  status: MatchStatus;
}

export interface CreateMatchInput {
  hostUserId: string;
  opponentUserId: string;
  scheduledAt: string; // ISO string
  venueId?: string | null;
  playerAId?: string | null;
  playerBId?: string | null;
  inviteId?: string | null;
  availabilityId?: string | null;
}
