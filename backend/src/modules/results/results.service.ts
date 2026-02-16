/**
 * results.service.ts
 * -------------------------------------------------------------
 * Strict domain logic for recording tennis match results.
 *
 * DESIGN PRINCIPLES (UPDATED):
 *
 * - A Result belongs to exactly one Match.
 * - A Match can have at most one Result.
 * - Winner is always a User (never a Player).
 * - Results are descriptive only — no ranking, statistics, or ELO updates by default.
 * - Result confirmation now drives Match lifecycle transitions:
 *     - confirmResult() may transition Match.status to 'completed' if both players confirm.
 *     - Ranking updates are triggered ONLY when a match transitions to 'completed'.
 * - The completeMatch() method is now an admin-only override, not part of the normal lifecycle.
 * - All domain invariants are enforced explicitly and transactionally.
 *
 * This module is intentionally isolated from:
 * - Direct ranking updates (except via lifecycle transition in confirmResult)
 * - Performance analytics
 * - Notifications
 *
 * It is primarily responsible for storing structured match outcome data and orchestrating lifecycle transitions via result confirmation.
 */

import { prisma } from '../../prisma';
import { AppError } from '../../shared/errors/AppError';
import { RatingService } from '../rating/rating.service';
import { ResultDTO, SetResultDTO, AddSetResultInput, SubmitMatchResultInput } from './results.types';
import { MatchStatus, Result, SetResult } from '@prisma/client';
import { createNotification } from '../notifications/notifications.service';

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
    const match = await findMatchOrThrow(tx, matchId);
    ensureMatchScheduled(match);
    
    // Block manual result creation for practice matches
    if (match.type === 'practice') {
      throw new AppError('Cannot create result for practice match', 400);
    }
    await ensureNoExistingResult(tx, matchId);
    if (winnerUserId) {
      ensureWinnerIsParticipant(winnerUserId, match.hostUserId, match.opponentUserId);
    }
    assertCanCreateResult(currentUserId, match.hostUserId, match.opponentUserId, isAdmin);
    const result = await tx.result.create({
      data: {
        matchId,
        winnerUserId: winnerUserId !== null ? winnerUserId : undefined,
        status: 'draft',
        confirmedByHostAt: null,
        confirmedByOpponentAt: null,
        disputedByHostAt: null,
        disputedByOpponentAt: null,
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
    const result = await findResultWithMatchOrThrow(tx, resultId);
    ensureResultEditable(result);
    ensureResultHasMatch(result);
    ensureMatchScheduled(result.match);
    ensureSetNumberUnique(result.sets, input.setNumber);
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
 * submitMatchResult: First confirmation step for a match result.
 *
 * - Creates the Result (if not already present)
 * - Inserts SetResults
 * - Computes winner server-side
 * - Sets:
 *     - status = 'submitted'
 *     - submittedByUserId = currentUserId
 *     - confirmedByHostAt OR confirmedByOpponentAt = now (depending on who submits)
 * - Updates Match.status to 'awaiting_confirmation'
 *
 * Rules:
 * - If currentUserId === hostUserId → set confirmedByHostAt
 * - If currentUserId === opponentUserId → set confirmedByOpponentAt
 * - Match must still be 'scheduled'
 * - Lifecycle consistency must hold
 * - Idempotent: If already submitted, returns existing result
 * - Runs inside a transaction
 * - Does NOT trigger ranking updates, complete match, or send notifications
 */
export async function submitMatchResult(input: SubmitMatchResultInput): Promise<ResultDTO | null> {
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

    // PRACTICE MATCH: result is optional, allow empty sets
    if (!match.type) {
      throw new AppError('Match type missing', 500);
    }
    const matchType = match.type;
    if (matchType === 'practice' && (!sets || sets.length === 0)) {
      // No-op: allow submission with no sets, do not create result
      return null;
    }

    // Idempotency: If a result already exists, return it (do not re-insert sets or update status)
    const existing = await tx.result.findUnique({ where: { matchId }, include: { sets: true } });
    if (existing) {
      // If already submitted, return as DTO
      return toResultDTO(existing);
    }

    if (!sets || sets.length === 0) {
      throw new AppError('At least one set is required', 400);
    }
    for (const set of sets) {
      validateSetScore(set);
    }

    // Compute winner server-side
    const winnerUserId = computeWinnerFromSets(
      sets,
      match.hostUserId,
      match.opponentUserId
    );

    // Set confirmation fields
    const now = new Date();
    const confirmationFields: any = {
      status: 'submitted',
      submittedByUserId: currentUserId,
      confirmedByHostAt: null,
      confirmedByOpponentAt: null,
    };
    if (currentUserId === match.hostUserId) {
      confirmationFields.confirmedByHostAt = now;
    } else if (currentUserId === match.opponentUserId) {
      confirmationFields.confirmedByOpponentAt = now;
    }

    // Create result
    const result = await tx.result.create({
      data: {
        matchId,
        winnerUserId,
        ...confirmationFields,
      },
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
          tiebreakScoreB: set.tiebreakScoreB ?? null,
        },
      });
    }

    // Update match status to awaiting_confirmation (only for competitive)
    if (matchType === 'competitive') {
      await tx.match.update({
        where: { id: matchId },
        data: { status: MatchStatus.awaiting_confirmation },
      });
    }

    // Return full result with sets
    const fullResult = await tx.result.findUnique({
      where: { id: result.id },
      include: { sets: true },
    });
    if (!fullResult) throw new AppError('Result not found after creation', 500);
    return toResultDTO(fullResult);
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
  // Transactional: all logic runs inside a single transaction
  let transitionedToCompleted = false;
  let matchCompletedPayload: { matchId: string; winnerId: string | null } | null = null;
  let playerAUserId: string | null = null;
  let playerBUserId: string | null = null;
  let completedMatchType: string | null = null;
  let completedMatchId: string | null = null;

  // Short-circuit for practice matches: no lifecycle, rating, or notifications
  const resultDTO = await prisma.$transaction(async (tx) => {
    // 1. Load Result and Match
    const result = await tx.result.findUnique({ where: { id: resultId }, include: { match: true } });
    if (!result) throw new AppError('Result not found', 404);
    const match = result.match;
    if (!match) throw new AppError('Match not found for result', 404);

    if (!match.type) {
      throw new AppError('Match type missing', 500);
    }
    if (match.type === 'practice') {
      // For practice, just return current state, no lifecycle, rating, or notifications
      const sets = await tx.setResult.findMany({ where: { resultId }, orderBy: { setNumber: 'asc' } });
      return toResultDTO({ ...result, sets });
    }

    // Defensive: Enforce lifecycle consistency
    validateResultMatchConsistency(result, { status: match.status, type: match.type });

    // Preconditions: block disputed first
    if ((result.status as string) === 'disputed' || (match.status as string) === 'disputed') {
      throw new AppError('Cannot confirm a disputed result', 400);
    }
    // Allow idempotency for already confirmed results
    if ((result.status as string) === 'confirmed') {
      const sets = await tx.setResult.findMany({ where: { resultId }, orderBy: { setNumber: 'asc' } });
      return toResultDTO({ ...result, sets });
    }
    if (result.status !== 'submitted') throw new AppError('Result is not awaiting confirmation', 400);
    if (match.status !== 'awaiting_confirmation') throw new AppError('Match is not awaiting confirmation', 400);

    // Only host or opponent can confirm
    const isHost = userId === match.hostUserId;
    const isOpponent = userId === match.opponentUserId;
    if (!isHost && !isOpponent) throw new AppError('User is not a participant in this match', 403);

    // Idempotency: If already confirmed by this user, return current state
    if ((isHost && result.confirmedByHostAt) || (isOpponent && result.confirmedByOpponentAt)) {
      const sets = await tx.setResult.findMany({ where: { resultId }, orderBy: { setNumber: 'asc' } });
      return toResultDTO({ ...result, sets });
    }

    // 2. Set confirmedByHostAt or confirmedByOpponentAt
    const now = new Date();
    const updateData: any = {};
    if (isHost && !result.confirmedByHostAt) updateData.confirmedByHostAt = now;
    if (isOpponent && !result.confirmedByOpponentAt) updateData.confirmedByOpponentAt = now;
    await tx.result.update({ where: { id: resultId }, data: updateData });

    // 3. Check if both confirmations are now present
    const confirmedResult = await tx.result.findUnique({ where: { id: resultId }, include: { match: true } });
    if (!confirmedResult) throw new AppError('Result not found after confirmation', 500);
    const bothConfirmed = !!confirmedResult.confirmedByHostAt && !!confirmedResult.confirmedByOpponentAt;

    if (bothConfirmed) {
      // 4. Finalize: set result.status = 'confirmed', match.status = 'completed'
      if (confirmedResult.status !== 'confirmed') {
        await tx.result.update({ where: { id: resultId }, data: { status: 'confirmed' } });
      }
      if ((match.status as string) !== 'completed') {
        await tx.match.update({ where: { id: match.id }, data: { status: 'completed' } });
        transitionedToCompleted = true;
        completedMatchType = match.type;
        completedMatchId = match.id;
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
      // 5. Prepare notification payload for after transaction
      matchCompletedPayload = { matchId: match.id, winnerId: confirmedResult.winnerUserId };
      // Defensive: Only notify if both playerAId and playerBId exist
      playerAUserId = match.playerAId ? (await tx.player.findUnique({ where: { id: match.playerAId } }))?.userId ?? null : null;
      playerBUserId = match.playerBId ? (await tx.player.findUnique({ where: { id: match.playerBId } }))?.userId ?? null : null;
    }

    // 6. Return updated ResultDTO
    const sets = await tx.setResult.findMany({ where: { resultId }, orderBy: { setNumber: 'asc' } });
    const finalResult = await tx.result.findUnique({ where: { id: resultId } });
    if (!finalResult) throw new AppError('Result not found after confirmation', 500);
    return toResultDTO({ ...finalResult, sets });
  });

  // 7. Trigger rating update ONLY if match transitioned to completed and is competitive
  if (transitionedToCompleted && completedMatchType === 'competitive' && completedMatchId) {
    await RatingService.updateRatingsForCompletedMatch(prisma, completedMatchId);
  }

  // 8. Send notifications as a side effect (outside transaction)
  // Never send notifications for practice matches
  if (transitionedToCompleted && matchCompletedPayload) {
    // Notify both players (if userId is available)
    if (playerAUserId) {
      await createNotification(playerAUserId, 'match.completed', matchCompletedPayload);
    }
    if (playerBUserId && playerBUserId !== playerAUserId) {
      await createNotification(playerBUserId, 'match.completed', matchCompletedPayload);
    }
  }
  return resultDTO;
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
    validateResultMatchConsistency(result, { status: result.match.status, type: result.match.type });
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

/**
 * Throws if result/match lifecycle states are inconsistent.
 * Allowed pairs:
 *   - draft      ↔ scheduled
 *   - submitted  ↔ awaiting_confirmation
 *   - confirmed  ↔ completed
 *   - disputed   ↔ disputed
 * Throws AppError(500) if mismatch.
 */
/**
 * Enforces strict result/match lifecycle consistency.
 *
 * Allowed transitions:
 *   - draft      ↔ scheduled
 *   - submitted  ↔ awaiting_confirmation
 *   - confirmed  ↔ completed
 *   - disputed   ↔ disputed
 *
 * Defensive: No other combinations are allowed.
 *
 * - submitMatchResult: scheduled → awaiting_confirmation (result: draft → submitted)
 * - confirmResult: awaiting_confirmation → completed (result: submitted → confirmed)
 * - completeMatch: confirmed → completed (admin override only)
 */
export function validateResultMatchConsistency(result: { status: string }, match: { status: string, type: string | null }) {
  // Only enforce lifecycle mapping for competitive matches
  if (match.type !== 'competitive') {
    return;
  }
  const allowed: Record<string, string> = {
    draft: 'scheduled',
    submitted: 'awaiting_confirmation',
    confirmed: 'completed',
    disputed: 'disputed',
  };
  // Defensive: Only allow exact pairs
  if (allowed[result.status] !== match.status) {
    throw new AppError(
      `Inconsistent match/result lifecycle state: result.status='${result.status}' match.status='${match.status}'`,
      500
    );
  }
}

// PRIVATE HELPERS

async function findMatchOrThrow(tx: any, matchId: string) {
  const match = await tx.match.findUnique({ where: { id: matchId } });
  if (!match) throw new AppError('Match not found', 404);
  return match;
}

function ensureMatchScheduled(match: { status: string }) {
  if (match.status !== MatchStatus.scheduled) {
    throw new AppError('Cannot create result: Match is not in scheduled state', 409);
  }
}

async function ensureNoExistingResult(tx: any, matchId: string) {
  const existing = await tx.result.findUnique({ where: { matchId } });
  if (existing) {
    throw new AppError('Result already exists for this match', 409);
  }
}

function ensureWinnerIsParticipant(winnerUserId: string, hostUserId: string, opponentUserId: string) {
  if (winnerUserId !== hostUserId && winnerUserId !== opponentUserId) {
    throw new AppError('Winner must be a participant of the match', 400);
  }
}

async function findResultWithMatchOrThrow(tx: any, resultId: string) {
  const result = await tx.result.findUnique({
    where: { id: resultId },
    include: { sets: true, match: true }
  });
  if (!result) throw new AppError('Result not found', 404);
  return result;
}

function ensureResultEditable(result: { status: string }) {
  if (result.status === 'confirmed') {
    throw new AppError('Cannot edit confirmed result', 409);
  }
}

function ensureResultHasMatch(result: { match?: any }) {
  if (!result.match) {
    throw new AppError('Invariant violation: Result has no Match', 500);
  }
}

function ensureSetNumberUnique(sets: { setNumber: number }[], setNumber: number) {
  if (sets.some(s => s.setNumber === setNumber)) {
    throw new AppError('Set number already exists for this result', 409);
  }
}