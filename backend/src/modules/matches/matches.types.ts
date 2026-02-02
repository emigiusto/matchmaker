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
 */
export interface MatchDTO {
  id: string;
  inviteId: string;
  availabilityId: string;
  venueId: string | null;
  playerAId: string | null;
  playerBId: string | null;
  scheduledAt: string; // ISO string
  createdAt: string;   // ISO string
}
