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
import { RatingService } from '../rating/rating.service';
import { ResultDTO, SetResultDTO, AddSetResultInput, SubmitMatchResultInput } from './results.types';
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

    // Set status = draft (default) for new results
    const result = await tx.result.create({
      data: {
        matchId,
        winnerUserId: winnerUserId !== null ? winnerUserId : undefined,
        status: 'draft' as any,
        confirmedByHostAt: null as any,
        confirmedByOpponentAt: null as any,
        disputedByHostAt: null as any,
        disputedByOpponentAt: null as any,
      } as any,
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

    if (result.status === 'confirmed') {
      throw new AppError('Cannot edit confirmed result', 409);
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

/**
 * Submit the result for a match, including set scores and winner.
 *
 * Transactionally creates a Result and associated SetResults for the given match.
 * Validates that the match exists, is scheduled, and the current user is a participant.
 * Optionally validates that the winnerUserId is a participant. Validates set scores and winner consistency.
 * Throws AppError on invalid input, unauthorized user, or domain violations.
 *
 * @param input - The result submission input, including matchId, winnerUserId, sets, and currentUserId.
 * @returns The created ResultDTO with all set results, sorted by set number.
 * @throws AppError if the match is not found, not scheduled, user is not a participant, or validation fails.
 */
export async function submitMatchResult(input: SubmitMatchResultInput): Promise<ResultDTO> {
  const { matchId, sets, currentUserId } = input;

  return prisma.$transaction(async (tx) => {

    const match = await tx.match.findUnique({ where: { id: matchId } });
    if (!match) throw new AppError('Match not found', 404);

    if (match.status !== MatchStatus.scheduled) {
      throw new AppError('Cannot submit result: Match is not scheduled', 409);
    }

    if (
      currentUserId !== match.hostUserId &&
      currentUserId !== match.opponentUserId
    ) {
      throw new AppError('Only match participants can submit result', 403);
    }

    const existing = await tx.result.findUnique({ where: { matchId } });
    if (existing) {
      throw new AppError('Result already exists for this match', 409);
    }

    if (!sets || sets.length === 0) {
      throw new AppError('At least one set is required', 400);
    }

    // Validate set scores
    for (const set of sets) {
      validateSetScore(set);
    }

    // Compute winner server-side
    const winnerUserId = computeWinnerFromSets(
      sets,
      match.hostUserId,
      match.opponentUserId
    );

    // Create result
    const result = await tx.result.create({
      data: {
        matchId,
        winnerUserId
      }
    });

    // Insert sets
    for (const set of sets) {
      await tx.setResult.create({
        data: {
          resultId: result.id,
          setNumber: set.setNumber,
          playerAScore: set.playerAScore,
          playerBScore: set.playerBScore,
          tiebreakScoreA: set.tiebreakScoreA ?? null,
          tiebreakScoreB: set.tiebreakScoreB ?? null
        }
      });
    }

    const fullResult = await tx.result.findUnique({
      where: { id: result.id },
      include: { sets: true }
    });

    if (!fullResult) {
      throw new AppError('Result not found after creation', 500);
    }

    return toResultDTO(fullResult);
  });
}

/**
 * Submits a result for confirmation by the other player.
 * - Sets Result.status = 'submitted'
 * - Sets Result.submittedByUserId = userId
 * - Sets Match.status = 'awaiting_confirmation'
 * - Throws if Result.status === 'confirmed'
 * - Returns updated ResultDTO
 */
export async function submitResult(resultId: string, userId: string): Promise<ResultDTO> {
  return await prisma.$transaction(async (tx) => {
    // Fetch result and match
    const result = await tx.result.findUnique({ where: { id: resultId }, include: { match: true, sets: true } });
    if (!result) throw new AppError('Result not found', 404);
    if (!result.match) throw new AppError('Result missing match', 500);
    // Defensive: Enforce lifecycle consistency
    const matchStatus = result.match.status;
    if (result.status === 'confirmed' && matchStatus !== 'completed') {
      throw new AppError('Lifecycle inconsistency: Result is confirmed but Match is not completed', 409);
    }
    if (result.status !== 'confirmed' && matchStatus === 'completed') {
      throw new AppError('Lifecycle inconsistency: Match is completed but Result is not confirmed', 409);
    }
    if (result.status === 'confirmed') {
      throw new AppError('Result already confirmed', 409);
    }
    // Update result status and submittedByUserId
    await tx.result.update({
      where: { id: resultId },
      data: {
        status: 'submitted',
        submittedByUserId: userId,
      },
    });
    // Update match status to awaiting_confirmation
    await tx.match.update({
      where: { id: result.matchId },
      data: { status: 'awaiting_confirmation' },
    });
    // Return updated result
    const updated = await tx.result.findUnique({ where: { id: resultId }, include: { sets: true } });
    if (!updated) throw new AppError('Result not found after update', 500);
    return toResultDTO(updated);
  });
}

/**
 * Confirms a submitted result by a user (host or opponent).
 * - Both players must confirm before finalization.
 * - Idempotent: does not double-update ratings or status.
 * - Only allowed if Result.status === 'submitted'.
 * - Sets confirmedByHostAt or confirmedByOpponentAt as appropriate.
 * - If both confirmations present, marks Result as confirmed, Match as completed, and triggers rating update.
 *
 * @param resultId - ID of the Result
 * @param userId - ID of the confirming user
 * @returns Updated ResultDTO
 * @throws AppError on invalid state or unauthorized
 */
export async function confirmResult(resultId: string, userId: string): Promise<ResultDTO> {
  return await prisma.$transaction(async (tx) => {
    // 1. Load Result and Match
    const result = await tx.result.findUnique({
      where: { id: resultId },
      include: { match: true },
    });
    if (!result) throw new AppError('Result not found', 404);
    const match = result.match;
    if (!match) throw new AppError('Match not found for result', 404);

    // Defensive: Enforce lifecycle consistency
    if (result.status === 'confirmed' && match.status !== 'completed') {
      throw new AppError('Lifecycle inconsistency: Result is confirmed but Match is not completed', 409);
    }
    if (result.status !== 'confirmed' && match.status === 'completed') {
      throw new AppError('Lifecycle inconsistency: Match is completed but Result is not confirmed', 409);
    }

    // 2. Block confirmation if disputed
    if (result.status === 'disputed') {
      throw new AppError('Cannot confirm a disputed result', 400);
    }
    // Only allow if status is 'submitted'
    if (result.status !== 'submitted') {
      throw new AppError('Result is not awaiting confirmation', 400);
    }

    // 3. Determine if user is host or opponent
    const isHost = userId === match.hostUserId;
    const isOpponent = userId === match.opponentUserId;
    if (!isHost && !isOpponent) {
      throw new AppError('User is not a participant in this match', 403);
    }

    // 4. Prepare update fields (idempotent)
    const now = new Date();
    let updateData: any = {};
    if (isHost && !result.confirmedByHostAt) {
      updateData.confirmedByHostAt = now;
    }
    if (isOpponent && !result.confirmedByOpponentAt) {
      updateData.confirmedByOpponentAt = now;
    }

    // If already confirmed by this user, do nothing (idempotent)
    if (Object.keys(updateData).length === 0) {
      // Already confirmed by this user, return current state
      const sets = await tx.setResult.findMany({ where: { resultId }, orderBy: { setNumber: 'asc' } });
      // Ensure all required fields are present and not undefined
      return toResultDTO({
        id: result.id,
        matchId: result.matchId,
        winnerUserId: result.winnerUserId,
        createdAt: result.createdAt,
        status: result.status,
        submittedByUserId: result.submittedByUserId ?? null,
        confirmedByHostAt: result.confirmedByHostAt,
        confirmedByOpponentAt: result.confirmedByOpponentAt,
        disputedByHostAt: result.disputedByHostAt,
        disputedByOpponentAt: result.disputedByOpponentAt,
        sets: sets
      } as Result & { sets: SetResult[] });
    }

    // 5. Update confirmation field(s)
    const updatedResult = await tx.result.update({
      where: { id: resultId },
      data: updateData,
    });

    // 6. Check if both confirmations are now set (after update)
    const confirmedResult = await tx.result.findUnique({ where: { id: resultId } });
    const bothConfirmed = !!confirmedResult?.confirmedByHostAt && !!confirmedResult?.confirmedByOpponentAt;

    if (bothConfirmed) {
      // 7. Mark Result as confirmed, Match as completed (if not already)
      let transitionedToCompleted = false;
      if (confirmedResult.status !== 'confirmed') {
        await tx.result.update({
          where: { id: resultId },
          data: { status: 'confirmed' },
        });
      }
      if (match.status !== 'completed') {
        await tx.match.update({
          where: { id: match.id },
          data: { status: 'completed' },
        });
        transitionedToCompleted = true;
      }
      // 8. Trigger rating update ONLY if match transitioned to completed
      if (transitionedToCompleted) {
        await RatingService.updateRatingsForCompletedMatch(tx as any, match.id);
      }
      // Defensive: After transition, check consistency
      const finalResult = await tx.result.findUnique({ where: { id: resultId } });
      const finalMatch = await tx.match.findUnique({ where: { id: match.id } });
      if (finalResult?.status === 'confirmed' && finalMatch?.status !== 'completed') {
        throw new AppError('Lifecycle inconsistency: Result is confirmed but Match is not completed', 409);
      }
      if (finalResult?.status !== 'confirmed' && finalMatch?.status === 'completed') {
        throw new AppError('Lifecycle inconsistency: Match is completed but Result is not confirmed', 409);
      }
    }

    // 9. Return updated ResultDTO
    const sets = await tx.setResult.findMany({ where: { resultId }, orderBy: { setNumber: 'asc' } });
    const finalResult = await tx.result.findUnique({ where: { id: resultId } });
    if (!finalResult) throw new AppError('Result not found after confirmation', 500);
    return toResultDTO({
      id: finalResult.id,
      matchId: finalResult.matchId,
      winnerUserId: finalResult.winnerUserId,
      createdAt: finalResult.createdAt,
      status: finalResult.status,
      submittedByUserId: finalResult.submittedByUserId ?? null,
      confirmedByHostAt: finalResult.confirmedByHostAt,
      confirmedByOpponentAt: finalResult.confirmedByOpponentAt,
      disputedByHostAt: finalResult.disputedByHostAt,
      disputedByOpponentAt: finalResult.disputedByOpponentAt,
      sets: sets
    } as Result & { sets: SetResult[] });
  });
}

/**
 * Disputes a result, marking both the result and its match as disputed.
 *
 * - If Result.status === 'confirmed', throws error.
 * - Sets Result.status = 'disputed'
 * - Sets Match.status = 'disputed'
 * - Does NOT update rankings or delete result.
 *
 * @param resultId - ID of the Result
 * @param userId - ID of the disputing user (for future audit, not used here)
 * @returns Updated ResultDTO
 * @throws AppError if already confirmed or not found
 */
export async function disputeResult(resultId: string, userId: string): Promise<ResultDTO> {
  return await prisma.$transaction(async (tx) => {
    // Load Result and Match
    const result = await tx.result.findUnique({
      where: { id: resultId },
      include: { match: true },
    });
    if (!result) throw new AppError('Result not found', 404);
    if (!result.match) throw new AppError('Match not found for result', 404);
    if (result.status === 'confirmed') {
      throw new AppError('Cannot dispute a confirmed result', 409);
    }

    // Update Result and Match status to disputed
    await tx.result.update({
      where: { id: resultId },
      data: { status: 'disputed' },
    });
    await tx.match.update({
      where: { id: result.matchId },
      data: { status: 'disputed' },
    });

    // Return updated ResultDTO
    const updated = await tx.result.findUnique({ where: { id: resultId }, include: { sets: true } });
    if (!updated) throw new AppError('Result not found after dispute', 500);
    return toResultDTO(updated);
  });
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
    status: result.status ?? 'draft',
    confirmedByHostAt: result.confirmedByHostAt ? result.confirmedByHostAt.toISOString() : null,
    confirmedByOpponentAt: result.confirmedByOpponentAt ? result.confirmedByOpponentAt.toISOString() : null,
    disputedByHostAt: result.disputedByHostAt ? result.disputedByHostAt.toISOString() : null,
    disputedByOpponentAt: result.disputedByOpponentAt ? result.disputedByOpponentAt.toISOString() : null,
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
 * Computes the winner user ID based on submitted set results.
 *
 * Assumptions:
 * - playerAScore corresponds to match.hostUserId
 * - playerBScore corresponds to match.opponentUserId
 *
 * Rules:
 * - At least one set must exist
 * - Each set must have a clear winner
 * - Total sets won cannot be tied
 *
 * @param sets - Array of AddSetResultInput
 * @param hostUserId - Match host user ID
 * @param opponentUserId - Match opponent user ID
 * @returns winnerUserId
 * @throws AppError if no winner can be determined
 */
export function computeWinnerFromSets(
  sets: AddSetResultInput[],
  hostUserId: string,
  opponentUserId: string
): string {
  if (!sets || sets.length === 0) {
    throw new AppError('Cannot compute winner: no sets provided', 400);
  }

  let hostSetsWon = 0;
  let opponentSetsWon = 0;

  for (const set of sets) {
    if (set.playerAScore > set.playerBScore) {
      hostSetsWon++;
    } else if (set.playerBScore > set.playerAScore) {
      opponentSetsWon++;
    } else {
      // Should never happen due to validateSetScore
      throw new AppError('Invalid set: tie score detected', 400);
    }
  }

  if (hostSetsWon === opponentSetsWon) {
    throw new AppError(
      'Cannot determine winner: total sets are tied',
      400
    );
  }

  return hostSetsWon > opponentSetsWon
    ? hostUserId
    : opponentUserId;
}
