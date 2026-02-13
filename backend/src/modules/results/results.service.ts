/**
 * results.service.ts
 * -------------------------------------------------------------
 * Strict domain logic for recording tennis match results.
 *
 * DESIGN PRINCIPLES:
 *
 * - A Result belongs to exactly one Match.
 * - A Match can have at most one Result.
 * - Winner is always a User (never a Player).
 * - Results are descriptive only — no ranking, statistics, or ELO updates.
 * - No Match lifecycle transitions occur here (completion is handled elsewhere).
 * - All domain invariants are enforced explicitly and transactionally.
 *
 * This module is intentionally isolated from:
 * - Ranking updates
 * - Performance analytics
 * - Notifications
 * - Match status transitions
 *
 * It is purely responsible for storing structured match outcome data.
 */

import { prisma } from '../../prisma';
import { AppError } from '../../shared/errors/AppError';
import { ResultDTO, SetResultDTO, AddSetResultInput, CreateResultInput } from './results.types';
import { MatchStatus, Result, SetResult } from '@prisma/client';

////////////////////////////////////////////////////////////
// CREATE RESULT
////////////////////////////////////////////////////////////

/**
 * Creates a Result for a Match.
 *
 * Domain Rules:
 * - Match must exist.
 * - Match must be in "scheduled" state.
 * - Only one Result is allowed per Match.
 * - winnerUserId must be either:
 *      - match.hostUserId
 *      - match.opponentUserId
 *
 * Does NOT:
 * - Mark the match as completed.
 * - Trigger ranking updates.
 * - Send notifications.
 *
 * All validation and creation logic runs inside a transaction
 * to guarantee atomic consistency.
 *
 * @param matchId - ID of the Match
 * @param winnerUserId - User ID of the winner
 * @returns ResultDTO
 * @throws AppError on invariant violation
 */
export async function createResult(
  matchId: string,
  winnerUserId: string | null,
  currentUserId: string,
  isAdmin: boolean
): Promise<ResultDTO> {
  return prisma.$transaction(async (tx) => {
    const match = await tx.match.findUnique({
      where: { id: matchId }
    });

    if (!match) {
      throw new AppError('Match not found', 404);
    }

    if (match.status !== MatchStatus.scheduled) {
      throw new AppError('Cannot create result: Match is not in scheduled state', 409);
    }

    const existing = await tx.result.findUnique({
      where: { matchId }
    });

    if (existing) {
      throw new AppError('Result already exists for this match', 409);
    }

    if (winnerUserId) {
      if (
        winnerUserId !== match.hostUserId &&
        winnerUserId !== match.opponentUserId
      ) {
        throw new AppError('Winner must be a participant of the match', 400);
      }
    }

    assertCanCreateResult(currentUserId, match.hostUserId, match.opponentUserId, isAdmin);

    const result = await tx.result.create({
      data: {
        matchId,
        winnerUserId: winnerUserId !== null ? winnerUserId : undefined
      },
      include: { sets: true }
    });

    return toResultDTO(result);
  });
}

////////////////////////////////////////////////////////////
// ADD SET RESULT
////////////////////////////////////////////////////////////

/**
 * Adds a SetResult to an existing Result.
 *
 * Domain Rules:
 * - Result must exist.
 * - Result must belong to a valid Match.
 * - Match must still be in "scheduled" state.
 * - setNumber must be unique per Result.
 * - Scores must pass basic tennis validation.
 *
 * Does NOT:
 * - Auto-complete the match.
 * - Validate match winner consistency across sets.
 * - Update rankings or statistics.
 *
 * Runs in a transaction to ensure atomicity.
 *
 * @param resultId - ID of the Result
 * @param input - SetResult data
 * @returns SetResultDTO
 */
export async function addSetResult(
  resultId: string,
  input: AddSetResultInput
): Promise<SetResultDTO> {
  return prisma.$transaction(async (tx) => {
    const result = await tx.result.findUnique({
      where: { id: resultId },
      include: {
        sets: true,
        match: true
      }
    });

    if (!result) {
      throw new AppError('Result not found', 404);
    }

    if (!result.match) {
      throw new AppError('Invariant violation: Result has no Match', 500);
    }

    if (result.match.status !== MatchStatus.scheduled) {
      throw new AppError('Cannot modify result: Match is not scheduled', 409);
    }

    if (result.sets.some(s => s.setNumber === input.setNumber)) {
      throw new AppError('Set number already exists for this result', 409);
    }

    validateSetScore(input);

    const set = await tx.setResult.create({
      data: {
        resultId,
        setNumber: input.setNumber,
        playerAScore: input.playerAScore,
        playerBScore: input.playerBScore,
        tiebreakScoreA: input.tiebreakScoreA ?? null,
        tiebreakScoreB: input.tiebreakScoreB ?? null
      }
    });

    return toSetResultDTO(set);
  });
}

////////////////////////////////////////////////////////////
// GET RESULT BY MATCH
////////////////////////////////////////////////////////////

/**
 * Retrieves the Result associated with a Match.
 *
 * @param matchId - Match ID
 * @returns ResultDTO
 * @throws AppError if result does not exist
 */
export async function getResultByMatch(matchId: string): Promise<ResultDTO> {
  const result = await prisma.result.findUnique({
    where: { matchId },
    include: { sets: true }
  });

  if (!result) {
    throw new AppError('Result not found for this match', 404);
  }

  return toResultDTO(result);
}

////////////////////////////////////////////////////////////
// GET RESULTS BY USER
////////////////////////////////////////////////////////////

/**
 * Retrieves all Results where the user participated
 * either as host or opponent.
 *
 * Does NOT:
 * - Include ranking aggregation
 * - Include performance analysis
 *
 * @param userId - User ID
 * @returns ResultDTO[]
 */
export async function getResultsByUser(userId: string): Promise<ResultDTO[]> {
  const results = await prisma.result.findMany({
    where: {
      match: {
        OR: [
          { hostUserId: userId },
          { opponentUserId: userId }
        ]
      }
    },
    include: { sets: true },
    orderBy: { createdAt: 'desc' }
  });
  return results.map(toResultDTO);
}

////////////////////////////////////////////////////////////
// GET RECENT RESULTS
////////////////////////////////////////////////////////////

/**
 * Returns most recent Results.
 *
 * Intended for:
 * - Activity feeds
 * - Admin views
 * - Public timelines
 *
 * @param limit - Number of results to return (default 10)
 */
export async function getRecentResults(limit = 10): Promise<ResultDTO[]> {
  const results = await prisma.result.findMany({
    include: { sets: true },
    orderBy: { createdAt: 'desc' },
    take: limit
  });

  return results.map(toResultDTO);
}

////////////////////////////////////////////////////////////
// HELPERS
////////////////////////////////////////////////////////////

/**
 * Validates a tennis set score.
 *
 * Basic constraints:
 * - Scores must be >= 0
 * - No tie score allowed
 * - At least one player must reach 6 games
 * - Tiebreak scores must be non-negative
 *
 * NOTE:
 * This is intentionally simplified.
 * Future versions may enforce:
 * - 2-game difference rule
 * - Super tiebreak formats
 * - Tournament-specific rules
 */
export function validateSetScore(input: AddSetResultInput) {
  const {
    playerAScore,
    playerBScore,
    tiebreakScoreA,
    tiebreakScoreB
  } = input;

  if (playerAScore < 0 || playerBScore < 0) {
    throw new AppError('Scores must be positive numbers', 400);
  }

  if (playerAScore === playerBScore) {
    throw new AppError('Set cannot end in a tie', 400);
  }

  if (Math.max(playerAScore, playerBScore) < 6) {
    throw new AppError('Invalid tennis set score', 400);
  }

  if ((tiebreakScoreA ?? 0) < 0 || (tiebreakScoreB ?? 0) < 0) {
    throw new AppError('Invalid tiebreak score', 400);
  }
}

/**
 * Converts Prisma Result model into API DTO.
 * Ensures:
 * - ISO string formatting
 * - Ordered sets
 */
function toResultDTO(result: Result & { sets?: SetResult[] }): ResultDTO {
  return {
    id: result.id,
    matchId: result.matchId,
    winnerUserId: result.winnerUserId ?? null,
    createdAt: result.createdAt.toISOString(),
    sets: (result.sets ?? [])
      .slice()
      .sort((a, b) => a.setNumber - b.setNumber)
      .map(toSetResultDTO)
  };
}

/**
 * Converts Prisma SetResult into API DTO.
 */
function toSetResultDTO(set: SetResult): SetResultDTO {
  return {
    id: set.id,
    setNumber: set.setNumber,
    playerAScore: set.playerAScore,
    playerBScore: set.playerBScore,
    tiebreakScoreA: set.tiebreakScoreA,
    tiebreakScoreB: set.tiebreakScoreB
  };
}

/**
 * Checks if a user is authorized to create a result for a match.
 * Allows host, opponent, or admin.
 * @param currentUserId - ID of the user attempting to create the result
 * @param hostUserId - ID of the match host
 * @param opponentUserId - ID of the match opponent
 * @param isAdmin - Whether the user is an admin
 * @throws AppError if unauthorized
 */
export function assertCanCreateResult(
  currentUserId: string,
  hostUserId: string,
  opponentUserId: string,
  isAdmin: boolean
) {
  if (
    currentUserId !== hostUserId &&
    currentUserId !== opponentUserId &&
    !isAdmin
  ) {
    throw new AppError('Only match participants or admin can create the result', 403);
  }
}

/**
 * Validates that the declared winnerUserId matches the actual winner derived from set scores.
 * Throws AppError(400) if inconsistent or tie.
 *
 * @param sets - Array of AddSetResultInput
 * @param winnerUserId - Declared winner user ID
 * @param hostUserId - User ID of host
 * @param opponentUserId - User ID of opponent
 */
export function validateWinnerConsistency(
  sets: AddSetResultInput[],
  winnerUserId: string | null,
  hostUserId: string,
  opponentUserId: string
) {
  if (!winnerUserId || sets.length === 0) return;
  let setsWonA = 0;
  let setsWonB = 0;
  for (const set of sets) {
    if (set.playerAScore > set.playerBScore) setsWonA++;
    else if (set.playerBScore > set.playerAScore) setsWonB++;
  }
  let actualWinnerUserId: string | null = null;
  if (setsWonA > setsWonB) actualWinnerUserId = hostUserId;
  else if (setsWonB > setsWonA) actualWinnerUserId = opponentUserId;
  else throw new AppError('Set results are tied: no winner can be determined', 400);
  if (winnerUserId !== actualWinnerUserId) {
    throw new AppError('Winner does not match set results', 400);
  }
}