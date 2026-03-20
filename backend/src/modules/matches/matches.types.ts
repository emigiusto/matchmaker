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

export type MatchType = 'competitive' | 'practice';

export interface MatchParticipantDTO {
  userId: string;
  team: 'A' | 'B' | null;
  userName?: string;
}

export interface MatchDTO {
  id: string;
  inviteId: string | null;
  availabilityId: string | null;
  venueId: string | null;
  playerAId: string | null;
  playerBId: string | null;
  participants: MatchParticipantDTO[];
  scheduledAt: string; // ISO string
  createdAt: string;   // ISO string
  status: MatchStatus;
  type: MatchType;
  /** Location from availability (when included) */
  location?: string;
  /** Date YYYY-MM-DD (when included) */
  date?: string;
  /** Time HH:mm (when included) */
  time?: string;
  /** End time HH:mm (when included) */
  endTime?: string;
  /** Sport type (when match created via scheduling) */
  sportType?: 'tennis' | 'padel';
  /** Format: singles or doubles (when match created via scheduling) */
  format?: 'singles' | 'doubles';
  /** WhatsApp group JID — use /whatsapp-group-link to get the shareable invite URL */
  whatsappGroupId?: string | null;
  /** Public token for sharing match details without requiring login */
  publicToken?: string | null;
  /** Whether automatic court booking was enabled on the scheduling request */
  bookingEnabled?: boolean;
}

export interface CreateMatchInput {
  participantUserIds: string[];
  scheduledAt: string; // ISO string
  venueId?: string | null;
  playerAId?: string | null;
  playerBId?: string | null;
  inviteId?: string | null;
  availabilityId: string;
  type: MatchType;
}
