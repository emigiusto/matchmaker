// results.types.ts
// API-facing types for the results module
//
// Result is purely descriptive: it records the outcome of a match, but has no competitive or ranking meaning yet.

/**
 * SetResultDTO represents a single set's result in a match.
 * - No ranking or statistics fields.
 */
export interface SetResultDTO {
  id: string;
  setNumber: number;
  playerAScore: number;
  playerBScore: number;
  tiebreakScoreA: number | null;
  tiebreakScoreB: number | null;
}

/**
 * ResultDTO represents the result of a match.
 * - sets: Array of SetResultDTO
 * - winnerUserId is the user ID of the winner (not player ID, since we want to display winner info without joining players)
 * - createdAt is an ISO string
 */
export interface ResultDTO {
  id: string;
  matchId: string;
  createdAt: string; // ISO string
  sets: SetResultDTO[];
  winnerUserId: string | null;
}

/**
 * Input for creating a new Result (for a match)
 */
export interface CreateResultInput {
  matchId: string;
  winnerUserId: string | null;
  sets: AddSetResultInput[];
}

/**
 * Input for adding a set result to a Result
 */
export interface AddSetResultInput {
  setNumber: number;
  playerAScore: number;
  playerBScore: number;
  tiebreakScoreA?: number | null;
  tiebreakScoreB?: number | null;
}
