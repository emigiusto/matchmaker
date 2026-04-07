// matchmaking.types.ts
// API-facing types for the Matchmaking module
//
// Suggestions are NOT actions: they are read-only, explainable recommendations for who to play with.
// Output is explainable by design: every suggestion includes human-readable reasons.

/**
 * MatchmakingRequest
 * Input for matchmaking: who is requesting, and for which availability slot.
 * - userId: string (may be a guest, may not have a Player)
 * - availabilityId: string (the time slot to match for)
 */
export interface MatchmakingRequest {
  userId: string;
  availabilityId: string;
}

/**
 * MatchmakingCandidate
 * A single suggestion for a potential match.
 *
 * matchMode:
 *   'availability' - both users have overlapping availability slots (overlap bonus included in score)
 *   'profile'      - no availability overlap; matched purely on profile attributes (level, location, etc.)
 *
 * hasOpenAvailability:
 *   true if the candidate has at least one open future availability slot, regardless of mode.
 *   Used by the frontend to decide whether to show the time-slot picker or a "connect" CTA.
 *
 * requesterAvailabilityId / candidateAvailabilityId / overlapRange:
 *   Only present in 'availability' mode. Absent in 'profile' mode.
 */
export interface MatchmakingCandidate {
  candidateUserId: string;
  candidatePlayerId: string | null;
  score: number;
  reasons: string[];
  matchMode: 'availability' | 'profile';
  hasOpenAvailability: boolean;
  scoreBreakdown?: {
    availability?: number;
    social?: number;
    level?: number;
    location?: number;
    surface?: number;
    recentActivity?: number;
  };
  overlapRange?: {
    start: string;
    end: string;
  };
  requesterAvailabilityId?: string;
  candidateAvailabilityId?: string;
  candidateLevel: number;
  candidateLocation: {
    latitude: number;
    longitude: number;
  } | null;
}

/**
 * MatchmakingResult
 * The output of a matchmaking request: a list of ranked candidates for a given availability.
 * - availabilityId: string (the slot for which suggestions were generated)
 * - candidates: MatchmakingCandidate[] (ranked, best first)
 */
export interface MatchmakingResult {
  availabilityId: string;
  candidates: MatchmakingCandidate[];
}
