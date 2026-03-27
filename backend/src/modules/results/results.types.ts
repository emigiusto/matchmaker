// results.types.ts
// API-facing types for the results module
//
// Result is purely descriptive: it records the outcome of a match, but has no competitive or ranking meaning yet.

export interface PostMatchQuestionnaire {
  matchPlayedOut?: string[];
  mainStrategy?: string[];
  whatWorkedBest?: string[];
  whatDidntWork?: string[];
  generalSensation?: string[];
  pointBuilding?: string[];
  serveStrategy?: string[];
  targetedSide?: string[];
  tacticAdjustment?: string[];
  importantPoints?: string[];
  netApproach?: string[];
  opponentStrength?: string[];
  mainMistake?: string[];
}

/**
 * SetResultDTO represents a single set's result in a match.
 * - No ranking or statistics fields.
 */
export interface SetResultDTO {
  id: string;
  setNumber: number;
  player1Score: number;
  player2Score: number;
  tiebreakScore1: number | null;
  tiebreakScore2: number | null;
}

export type ResultStatus = 'draft' | 'submitted' | 'confirmed' | 'disputed';

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
  submittedByUserId: string | null;
  status: ResultStatus;
  confirmedByHostAt: string | null;
  confirmedByOpponentAt: string | null;
  disputedByHostAt: string | null;
  disputedByOpponentAt: string | null;
  disputeNote: string | null;
  questionnaire: PostMatchQuestionnaire | null;
  aceupSyncedAt: string | null;
  aceupChallengeId: number | null;
}

export interface ResolveDisputeInput {
  resultId: string;
  adminUserId: string;
  sets: AddSetResultInput[];
}

export interface DisputeResultInput {
  resultId: string;
  userId: string;
  isAdmin: boolean;
  disputeNote?: string | null;
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


export interface SubmitMatchResultInput {
  matchId: string;
  sets: AddSetResultInput[];
  currentUserId: string;
  questionnaire?: PostMatchQuestionnaire | null;
  /** When participants have no teams yet, define who played on each side. Team A = playerAScore, Team B = playerBScore. */
  teamAssignment?: { teamAUserIds: string[]; teamBUserIds: string[] };
  /** Allow overriding the match type at submission time (e.g. switching competitive → practice). */
  matchType?: 'competitive' | 'practice';
}

// Note: submitMatchResult may return null for practice matches with no sets
// Promise<ResultDTO | null>