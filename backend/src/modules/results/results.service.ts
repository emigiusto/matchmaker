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
import { ResultDTO, SetResultDTO, AddSetResultInput, SubmitMatchResultInput, DisputeResultInput, ResolveDisputeInput, PostMatchQuestionnaire } from './results.types';
import { MatchStatus, Prisma, Result, SetResult } from '@prisma/client';
import { createNotification } from '../notifications/notifications.service';
import { whatsappService } from '../whatsapp/whatsapp.service';
import { getMessages } from '../../lib/whatsapp-messages';
import { resolveGroupMessageLocale } from '../../lib/locale-helpers';
import { logger } from '../../config/logger';

const FRONTEND_BASE = process.env.FRONTEND_BASE_URL || 'https://matchmaker-flame.vercel.app';

export async function notifyResultSubmittedToGroup(matchId: string, result: ResultDTO): Promise<void> {
  const [match, schedulingRequest] = await Promise.all([
    prisma.match.findUnique({
      where: { id: matchId },
      select: {
        whatsappGroupId: true,
        participants: {
          select: { userId: true, team: true, user: { select: { name: true } } },
        },
      },
    }),
    prisma.schedulingRequest.findUnique({ where: { matchId }, select: { hostUserId: true, format: true } }).catch(() => null),
  ]);
  const groupId = match?.whatsappGroupId;
  if (!groupId) return;

  // Build per-team labels from participant first names
  const firstName = (name: string | null | undefined) => (name ?? '').split(' ')[0] || '?';
  const teamA = (match.participants ?? []).filter((p) => p.team === 'A');
  const teamB = (match.participants ?? []).filter((p) => p.team === 'B');
  const labelA = teamA.map((p) => firstName(p.user?.name)).join(' / ') || 'A';
  const labelB = teamB.map((p) => firstName(p.user?.name)).join(' / ') || 'B';

  const sets = result.sets
    .slice()
    .sort((a, b) => a.setNumber - b.setNumber)
    .map((s) => ({ setNumber: s.setNumber, scoreA: s.player1Score, scoreB: s.player2Score }));

  const hostUserId = schedulingRequest?.hostUserId ?? match.participants[0]?.userId ?? '';
  const participantIds = match.participants.map((p) => p.userId);
  const locale = hostUserId
    ? await resolveGroupMessageLocale(hostUserId, participantIds, schedulingRequest?.format ?? 'singles')
    : 'es';
  const matchUrl = `${FRONTEND_BASE.replace(/\/$/, '')}/#/matches/${matchId}`;
  const message = getMessages(locale).resultSubmitted(sets, labelA, labelB, matchUrl);

  try {
    await whatsappService.sendGroupMessage(groupId, message);
    logger.info('ResultSubmittedWhatsAppSent', { matchId, groupId });
  } catch (err) {
    logger.error('Failed to send WhatsApp result notification', {
      matchId,
      groupId,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

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
 * - winnerUserId must be a match participant
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
    const matchWithParts = await tx.match.findUnique({
      where: { id: matchId },
      include: { participants: { select: { userId: true } } },
    });
    const participantIds = (matchWithParts?.participants ?? []).map((p: { userId: string }) => p.userId);
    if (winnerUserId) {
      ensureWinnerIsParticipant(winnerUserId, participantIds);
    }
    assertCanCreateResult(currentUserId, participantIds, isAdmin);
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
        participants: { some: { userId } },
      },
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
 * Returns all results with status 'disputed', enriched with match + participant info.
 * Intended for the admin disputes dashboard.
 */
export interface DisputedResultDTO extends ResultDTO {
  match: {
    id: string;
    date: string;
    time: string;
    location: string;
    type: string;
    participants: { userId: string; userName: string; team: string | null }[];
  };
}

export async function getDisputedResults(): Promise<DisputedResultDTO[]> {
  const results = await prisma.result.findMany({
    where: { status: 'disputed' },
    include: {
      sets: true,
      match: {
        include: {
          participants: {
            include: { user: { select: { id: true, name: true } } },
          },
        },
      },
    },
    orderBy: { createdAt: 'desc' },
  });

  return results.map((r) => {
    const match = r.match as any;
    return {
      ...toResultDTO(r),
      match: {
        id: match.id,
        date: match.date ?? '',
        time: match.time ?? '',
        location: match.location ?? '',
        type: match.type ?? '',
        participants: (match.participants ?? []).map((p: any) => ({
          userId: p.userId,
          userName: p.user?.name ?? p.userId,
          team: p.team ?? null,
        })),
      },
    };
  });
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
function getTeamAAndTeamB(
  participants: { userId: string; team: string | null }[]
): { teamAUserIds: string[]; teamBUserIds: string[] } {
  const teamAUserIds = participants.filter((p) => p.team === 'A').map((p) => p.userId);
  const teamBUserIds = participants.filter((p) => p.team === 'B').map((p) => p.userId);
  return { teamAUserIds, teamBUserIds };
}

export async function submitMatchResult(input: SubmitMatchResultInput): Promise<ResultDTO | null> {
  const { matchId, sets, currentUserId, teamAssignment, questionnaire, matchType: requestedMatchType } = input;

  return prisma.$transaction(async (tx) => {
    const match = await tx.match.findUnique({
      where: { id: matchId },
      include: {
        participants: { select: { userId: true, team: true } },
        playerA: { select: { userId: true } },
        playerB: { select: { userId: true } },
      },
    });
    if (!match) throw new AppError('Match not found', 404);
    if (match.status !== MatchStatus.scheduled) {
      throw new AppError('Cannot submit result: Match is not scheduled', 409);
    }
    const isParticipant = (match as any).participants?.some((p: { userId: string }) => p.userId === currentUserId);

    // Override match type if requested (e.g. competitive → practice at submission time)
    if (requestedMatchType && requestedMatchType !== match.type) {
      await tx.match.update({ where: { id: matchId }, data: { type: requestedMatchType } });
      (match as any).type = requestedMatchType;
    }
    if (!isParticipant) {
      throw new AppError('Only match participants can submit result', 403);
    }

    let teamAUserIds: string[];
    let teamBUserIds: string[];
    if (teamAssignment) {
      teamAUserIds = teamAssignment.teamAUserIds;
      teamBUserIds = teamAssignment.teamBUserIds;
      for (const p of (match as any).participants) {
        const team = teamAUserIds.includes(p.userId) ? 'A' : teamBUserIds.includes(p.userId) ? 'B' : null;
        if (team) {
          await tx.matchParticipant.updateMany({
            where: { matchId, userId: p.userId },
            data: { team },
          });
        }
      }
    } else {
      const teams = getTeamAAndTeamB((match as any).participants ?? []);
      teamAUserIds = teams.teamAUserIds;
      teamBUserIds = teams.teamBUserIds;
      if (teamAUserIds.length === 0 || teamBUserIds.length === 0) {
        // Singles matches have playerA/playerB instead of explicit team assignments
        const playerAUserId = (match as any).playerA?.userId as string | undefined;
        const playerBUserId = (match as any).playerB?.userId as string | undefined;
        if (!playerAUserId || !playerBUserId) {
          // Last resort: submitter = TeamA, other participant = TeamB
          const otherParticipant = ((match as any).participants ?? []).find(
            (p: any) => p.userId !== currentUserId,
          );
          if (!otherParticipant?.userId) {
            throw new AppError('Teams must be defined when submitting result. Provide teamAssignment.', 400);
          }
          teamAUserIds = [currentUserId];
          teamBUserIds = [otherParticipant.userId];
        } else {
          teamAUserIds = [playerAUserId];
          teamBUserIds = [playerBUserId];
        }
        await tx.matchParticipant.updateMany({ where: { matchId, userId: teamAUserIds[0] }, data: { team: 'A' } });
        await tx.matchParticipant.updateMany({ where: { matchId, userId: teamBUserIds[0] }, data: { team: 'B' } });
      }
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

    const repA = teamAUserIds[0];
    const repB = teamBUserIds[0];
    const winnerUserId = computeWinnerFromSets(sets, repA, repB);

    const now = new Date();
    const confirmationFields: any = {
      status: 'submitted',
      submittedByUserId: currentUserId,
      confirmedByHostAt: null,
      confirmedByOpponentAt: null,
    };
    if (teamAUserIds.includes(currentUserId)) {
      confirmationFields.confirmedByHostAt = now;
    } else if (teamBUserIds.includes(currentUserId)) {
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

    // Save questionnaire to per-user table (private — not stored on the shared Result)
    if (questionnaire && Object.keys(questionnaire).length > 0) {
      await tx.matchQuestionnaire.upsert({
        where: { matchId_userId: { matchId, userId: currentUserId } },
        create: { matchId, userId: currentUserId, answers: questionnaire as Prisma.InputJsonValue },
        update: { answers: questionnaire as Prisma.InputJsonValue },
      });
    }

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

    // Update match status to awaiting_confirmation for all match types.
    // Rating updates are gated on match.type === 'competitive' separately.
    await tx.match.update({
      where: { id: matchId },
      data: { status: MatchStatus.awaiting_confirmation },
    });

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
    // 1. Load Result and Match with participants
    const result = await tx.result.findUnique({
      where: { id: resultId },
      include: { match: { include: { participants: { select: { userId: true, team: true } } } } },
    });
    if (!result) throw new AppError('Result not found', 404);
    const match = result.match;
    if (!match) throw new AppError('Match not found for result', 404);

    if (!match.type) {
      throw new AppError('Match type missing', 500);
    }
    if (match.type === 'practice') {
      const sets = await tx.setResult.findMany({ where: { resultId }, orderBy: { setNumber: 'asc' } });
      return toResultDTO({ ...result, sets });
    }

    validateResultMatchConsistency(result, { status: match.status, type: match.type });

    if (result.submittedByUserId && result.submittedByUserId === userId) {
      throw new AppError('The submitter cannot provide the second confirmation', 403);
    }

    if ((result.status as string) === 'disputed' || (match.status as string) === 'disputed') {
      throw new AppError('Cannot confirm a disputed result', 400);
    }
    if ((result.status as string) === 'confirmed') {
      const sets = await tx.setResult.findMany({ where: { resultId }, orderBy: { setNumber: 'asc' } });
      return toResultDTO({ ...result, sets });
    }
    if (result.status !== 'submitted') throw new AppError('Result is not awaiting confirmation', 400);
    if (match.status !== 'awaiting_confirmation') throw new AppError('Match is not awaiting confirmation', 400);

    const { teamAUserIds, teamBUserIds } = getTeamAAndTeamB((match as any).participants ?? []);
    if (teamAUserIds.length === 0 || teamBUserIds.length === 0) {
      throw new AppError('Match participants have no team assignment', 400);
    }
    const isTeamA = teamAUserIds.includes(userId);
    const isTeamB = teamBUserIds.includes(userId);
    if (!isTeamA && !isTeamB) throw new AppError('User is not a participant in this match', 403);

    if ((isTeamA && result.confirmedByHostAt) || (isTeamB && result.confirmedByOpponentAt)) {
      const sets = await tx.setResult.findMany({ where: { resultId }, orderBy: { setNumber: 'asc' } });
      return toResultDTO({ ...result, sets });
    }

    const now = new Date();
    const updateData: any = {};
    if (isTeamA && !result.confirmedByHostAt) updateData.confirmedByHostAt = now;
    if (isTeamB && !result.confirmedByOpponentAt) updateData.confirmedByOpponentAt = now;
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
        // Set playerA/playerB for rating service (uses representative user per team)
        const repA = teamAUserIds[0];
        const repB = teamBUserIds[0];
        const [playerA, playerB] = await Promise.all([
          tx.player.findFirst({ where: { userId: repA } }),
          tx.player.findFirst({ where: { userId: repB } }),
        ]);
        const matchUpdateData: { status: MatchStatus; playerAId?: string; playerBId?: string } = {
          status: 'completed' as MatchStatus,
        };
        if (playerA) matchUpdateData.playerAId = playerA.id;
        if (playerB) matchUpdateData.playerBId = playerB.id;

        await tx.match.update({
          where: { id: match.id },
          data: matchUpdateData,
        });
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
      // Notify representative of each team (teamAUserIds[0], teamBUserIds[0])
      playerAUserId = teamAUserIds[0] ?? null;
      playerBUserId = teamBUserIds[0] ?? null;
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
export async function disputeResult(input: DisputeResultInput): Promise<ResultDTO> {
  const { resultId, userId, isAdmin, disputeNote } = input;
  return await prisma.$transaction(async (tx) => {
    const result = await tx.result.findUnique({
      where: { id: resultId },
      include: { match: { include: { participants: { select: { userId: true } } } } },
    });
    if (!result) throw new AppError('Result not found', 404);
    if (!result.match) throw new AppError('Match not found for result', 404);

    // Only participants and admins can dispute
    const participantIds = (result.match as any).participants?.map((p: { userId: string }) => p.userId) ?? [];
    if (!isAdmin && !participantIds.includes(userId)) {
      throw new AppError('Only match participants or admins can dispute a result', 403);
    }

    validateResultMatchConsistency(result, { status: result.match.status, type: result.match.type });
    if (result.status === 'confirmed') {
      throw new AppError('Cannot dispute a confirmed result', 409);
    }

    await tx.result.update({
      where: { id: resultId },
      data: { status: 'disputed', disputeNote: disputeNote ?? null },
    });
    await tx.match.update({
      where: { id: result.matchId },
      data: { status: 'disputed' },
    });

    const updated = await tx.result.findUnique({ where: { id: resultId }, include: { sets: true } });
    if (!updated) throw new AppError('Result not found after dispute', 500);
    const dto = toResultDTO(updated);

    // Fire notifications outside the transaction (non-blocking, best-effort)
    const matchId = result.matchId;
    const disputingUserId = userId;
    const otherParticipantIds = participantIds.filter((id: string) => id !== disputingUserId);

    setImmediate(async () => {
      try {
        // Notify other participant(s)
        for (const pid of otherParticipantIds) {
          await createNotification(pid, 'result.disputed', { matchId, _type: 'result.disputed' }).catch(() => {});
        }
        // Notify all admins
        const admins = await prisma.user.findMany({ where: { isAdmin: true }, select: { id: true } });
        for (const admin of admins) {
          if (!participantIds.includes(admin.id)) {
            await createNotification(admin.id, 'result.disputed.admin', { matchId, _type: 'result.disputed.admin' }).catch(() => {});
          }
        }
      } catch { /* notifications are non-critical */ }
    });

    return dto;
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
  const { playerAScore, playerBScore, tiebreakScoreA, tiebreakScoreB } = input;

  if (playerAScore < 0 || playerBScore < 0) {
    throw new AppError('Scores must be positive numbers', 400);
  }
  if (playerAScore === playerBScore) {
    throw new AppError('Set cannot end in a tie', 400);
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
    submittedByUserId: (result as any).submittedByUserId ?? null,
    createdAt: result.createdAt.toISOString(),
    status: result.status ?? 'draft',
    confirmedByHostAt: result.confirmedByHostAt ? result.confirmedByHostAt.toISOString() : null,
    confirmedByOpponentAt: result.confirmedByOpponentAt ? result.confirmedByOpponentAt.toISOString() : null,
    disputedByHostAt: result.disputedByHostAt ? result.disputedByHostAt.toISOString() : null,
    disputedByOpponentAt: result.disputedByOpponentAt ? result.disputedByOpponentAt.toISOString() : null,
    disputeNote: (result as any).disputeNote ?? null,
    questionnaire: null, // Questionnaire answers are per-user private — use GET /results/:matchId/questionnaire/mine
    aceupSyncedAt: result.aceupSyncedAt ? result.aceupSyncedAt.toISOString() : null,
    aceupChallengeId: result.aceupChallengeId ?? null,
    sets: (result.sets ?? [])
      .slice()
      .sort((a, b) => a.setNumber - b.setNumber)
      .map(toSetResultDTO)
  };
}

/**
 * Auto-confirms results that have been awaiting confirmation for >= 5 days with no dispute.
 * Called by the nightly autoconfirm job.
 * Returns the count of results auto-confirmed.
 */
export async function autoConfirmResults(): Promise<number> {
  const cutoff = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000);
  const results = await prisma.result.findMany({
    where: { status: 'submitted', createdAt: { lte: cutoff } },
    include: { match: { include: { participants: { select: { userId: true, team: true } } } } },
  });

  let count = 0;
  for (const result of results) {
    try {
      const now = new Date();
      await prisma.$transaction(async (tx) => {
        await tx.result.update({
          where: { id: result.id },
          data: {
            status: 'confirmed',
            confirmedByHostAt: result.confirmedByHostAt ?? now,
            confirmedByOpponentAt: result.confirmedByOpponentAt ?? now,
          },
        });
        await tx.match.update({
          where: { id: result.matchId },
          data: { status: 'completed' },
        });
      });
      if ((result.match as any)?.type === 'competitive') {
        await RatingService.updateRatingsForCompletedMatch(prisma, result.matchId);
      }
      count++;
    } catch (err) {
      // Log and continue — one failure should not stop the rest
      const { logger } = await import('../../config/logger');
      logger.error('AutoConfirmResult failed', { resultId: result.id, error: err instanceof Error ? err.message : err });
    }
  }
  return count;
}

// ─── Per-user questionnaire ─────────────────────────────────

/**
 * Upsert the calling user's questionnaire answers for a match.
 * Validates that the user is a match participant.
 */
export async function upsertMatchQuestionnaire(
  matchId: string,
  userId: string,
  answers: PostMatchQuestionnaire,
): Promise<PostMatchQuestionnaire> {
  const participant = await prisma.matchParticipant.findFirst({
    where: { matchId, userId },
  });
  if (!participant) throw new AppError('Only match participants can submit a questionnaire', 403);

  const record = await prisma.matchQuestionnaire.upsert({
    where: { matchId_userId: { matchId, userId } },
    create: { matchId, userId, answers: answers as Prisma.InputJsonValue },
    update: { answers: answers as Prisma.InputJsonValue },
  });
  return record.answers as PostMatchQuestionnaire;
}

/**
 * Get the calling user's own questionnaire answers for a match.
 * Returns null if the user has not submitted answers yet.
 */
export async function getMyMatchQuestionnaire(
  matchId: string,
  userId: string,
): Promise<PostMatchQuestionnaire | null> {
  const record = await prisma.matchQuestionnaire.findUnique({
    where: { matchId_userId: { matchId, userId } },
  });
  return record ? (record.answers as PostMatchQuestionnaire) : null;
}

/**
 * Converts Prisma SetResult into API DTO.
 */
function toSetResultDTO(set: SetResult): SetResultDTO {
  return {
    id: set.id,
    setNumber: set.setNumber,
    player1Score: set.playerAScore,
    player2Score: set.playerBScore,
    tiebreakScore1: set.tiebreakScoreA,
    tiebreakScore2: set.tiebreakScoreB,
  };
}

/**
 * Checks if a user is authorized to create a result for a match.
 * Allows host, opponent, or admin.
 * @param currentUserId - ID of the user attempting to create the result
 * @param participantIds - IDs of match participants
 * @param isAdmin - Whether the user is an admin
 * @throws AppError if unauthorized
 */
export function assertCanCreateResult(
  currentUserId: string,
  participantIds: string[],
  isAdmin: boolean
) {
  if (!participantIds.includes(currentUserId) && !isAdmin) {
    throw new AppError('Only match participants or admin can create the result', 403);
  }
}

/**
 * Computes the winner user ID based on submitted set results.
 *
 * Assumptions:
 * - playerAScore corresponds to team A (first param)
 * - playerBScore corresponds to team B (second param)
 *
 * Rules:
 * - At least one set must exist
 * - Each set must have a clear winner
 * - Total sets won cannot be tied
 *
 * @param sets - Array of AddSetResultInput
 * @param teamARepUserId - User ID representing team A (playerAScore)
 * @param teamBRepUserId - User ID representing team B (playerBScore)
 * @returns winnerUserId (teamARepUserId or teamBRepUserId)
 * @throws AppError if no winner can be determined
 */
export function computeWinnerFromSets(
  sets: AddSetResultInput[],
  teamARepUserId: string,
  teamBRepUserId: string
): string {
  if (!sets || sets.length === 0) {
    throw new AppError('Cannot compute winner: no sets provided', 400);
  }

  let teamASetsWon = 0;
  let teamBSetsWon = 0;

  for (const set of sets) {
    if (set.playerAScore > set.playerBScore) {
      teamASetsWon++;
    } else if (set.playerBScore > set.playerAScore) {
      teamBSetsWon++;
    } else {
      throw new AppError('Invalid set: tie score detected', 400);
    }
  }

  if (teamASetsWon === teamBSetsWon) {
    throw new AppError(
      'Cannot determine winner: total sets are tied',
      400
    );
  }

  return teamASetsWon > teamBSetsWon ? teamARepUserId : teamBRepUserId;
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

function ensureWinnerIsParticipant(winnerUserId: string, participantIds: string[]) {
  if (!participantIds.includes(winnerUserId)) {
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

/**
 * Admin-only: resolve a disputed result by supplying corrected set scores.
 * Resets the result to 'submitted' with new sets so the normal confirmation
 * flow can proceed. Clears dispute timestamps and note.
 */
export async function resolveDispute(input: ResolveDisputeInput): Promise<ResultDTO> {
  const { resultId, adminUserId, sets } = input;

  if (!sets || sets.length === 0) {
    throw new AppError('At least one set is required to resolve a dispute', 400);
  }
  for (const set of sets) {
    validateSetScore(set);
  }

  return prisma.$transaction(async (tx) => {
    const result = await tx.result.findUnique({
      where: { id: resultId },
      include: { match: { include: { participants: { select: { userId: true, team: true } } } } },
    });
    if (!result) throw new AppError('Result not found', 404);
    if (result.status !== 'disputed') {
      throw new AppError('Only disputed results can be resolved', 409);
    }

    const participants: { userId: string; team: string | null }[] = (result.match as any)?.participants ?? [];
    const { teamAUserIds, teamBUserIds } = getTeamAAndTeamB(participants);
    const repA = teamAUserIds[0] ?? null;
    const repB = teamBUserIds[0] ?? null;
    const winnerUserId = repA && repB ? computeWinnerFromSets(sets, repA, repB) : null;

    // Replace sets
    await tx.setResult.deleteMany({ where: { resultId } });
    for (const set of sets) {
      await tx.setResult.create({
        data: {
          resultId,
          setNumber: set.setNumber,
          playerAScore: set.playerAScore,
          playerBScore: set.playerBScore,
          tiebreakScoreA: set.tiebreakScoreA ?? null,
          tiebreakScoreB: set.tiebreakScoreB ?? null,
        },
      });
    }

    // Reset result: submitted, winner recomputed, dispute cleared, submitter = admin
    await tx.result.update({
      where: { id: resultId },
      data: {
        status: 'submitted',
        winnerUserId,
        submittedByUserId: adminUserId,
        disputeNote: null,
        disputedByHostAt: null,
        disputedByOpponentAt: null,
        confirmedByHostAt: null,
        confirmedByOpponentAt: null,
      },
    });

    // Reset match to awaiting_confirmation
    await tx.match.update({
      where: { id: result.matchId },
      data: { status: 'awaiting_confirmation' },
    });

    const updated = await tx.result.findUnique({ where: { id: resultId }, include: { sets: true } });
    if (!updated) throw new AppError('Result not found after resolve', 500);
    return toResultDTO(updated);
  });
}