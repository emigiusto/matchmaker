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
 * - candidateUserId: string (the suggested user's id)
 * - candidatePlayerId: string | null (the suggested player's id, if any)
 * - score: number (higher = better suggestion)
 * - reasons: string[] (human-readable explanations for this suggestion)
 */
export interface MatchmakingCandidate {
  candidateUserId: string;
  candidatePlayerId: string | null;
  score: number;
  reasons: string[];
  scoreBreakdown?: {
    availability?: number;
    social?: number;
    level?: number;
    location?: number;
    surface?: number;
  };
  overlapRange?: {
    start: string;
    end: string;
  };
  requesterAvailabilityId: string;
  candidateAvailabilityId: string;
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
