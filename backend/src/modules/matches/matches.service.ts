// matches.service.ts
// Read-only service for Match entities.
// Matches are derived and immutable: they are only created via Invite confirmation (see Invites module) and never modified directly.
// No creation or mutation logic here. No WhatsApp or external messaging logic.
// Guest fallback: playerA/playerB may be null for guest users or incomplete data.

import { AppError } from '../../shared/errors/AppError';
import { prisma } from '../../prisma';
import { MatchDTO, CreateMatchInput } from './matches.types';
import { Match, MatchStatus, Prisma } from '@prisma/client';
import { RatingService } from '../rating/rating.service';
import { createNotification } from '../notifications/notifications.service';

/**
 * Fetch a match by its ID. Throws AppError if not found.
 * Invariant: A Match always has a valid Invite and Availability.
 */
export async function getMatchById(matchId: string): Promise<MatchDTO> {
  // Defensive: Always fetch related Invite and Availability to ensure invariants
  const match = await prisma.match.findUnique({
    where: { id: matchId },
    include: {
      invite: true,
      availability: true,
    },
  });
  if (!match) throw new AppError('Match not found', 404);
  if (!match.invite) throw new AppError('Invariant violation: Match missing Invite', 500);
  if (!match.availability) throw new AppError('Invariant violation: Match missing Availability', 500);
  return toMatchDTO(match);
}

/**
 * List all matches for a given user (read-only).
 * Returns matches where:
 *   - user is the inviter (Invite.inviterId)
 *   - user owns the Availability (Availability.userId)
 *   - user has a Player participating (Player.userId)
 * No creation or mutation logic. Naming and logic consistent with Invites module.
 */
export async function listMatchesForUser(userId: string): Promise<MatchDTO[]> {
  // Defensive: Try to resolve Player for this user
  const player = await prisma.player.findUnique({ where: { userId } });

  // Build query conditions
  const orConditions: any[] = [
    { invite: { inviterId: userId } },
    { availability: { userId } },
  ];
  if (player) {
    // If user has a Player, include matches where they participate as playerA or playerB
    orConditions.push({ playerAId: player.id });
    orConditions.push({ playerBId: player.id });
  }

  // Defensive: Always fetch related Invite and Availability, sort, and deduplicate
  const matches = await prisma.match.findMany({
    where: {
      OR: orConditions,
    },
    include: {
      invite: true,
      availability: true,
    },
    orderBy: { scheduledAt: 'desc' },
  });
  // Deduplicate by match.id (in case of overlapping conditions)
  const uniqueMatches = Array.from(new Map(matches.map((m) => [m.id, m])).values());
  // Defensive: filter out any matches missing required relations
  return uniqueMatches.filter((m) => !!m.invite && !!m.availability).map(toMatchDTO);
}

/**
 * List all matches for a given player (read-only).
 * Returns matches where playerId is playerA or playerB.
 * No creation or mutation logic. Naming and logic consistent with Invites module.
 */
export async function listMatchesForPlayer(playerId: string): Promise<MatchDTO[]> {
  // Defensive: Always fetch related Invite and Availability, sort, and deduplicate
  const matches = await prisma.match.findMany({
    where: {
      OR: [
        { playerAId: playerId },
        { playerBId: playerId },
      ],
    },
    include: {
      invite: true,
      availability: true,
    },
    orderBy: { scheduledAt: 'desc' },
  });
  // Deduplicate by match.id (should not be needed, but defensive)
  const uniqueMatches = Array.from(new Map(matches.map((m) => [m.id, m])).values());
  // Defensive: filter out any matches missing required relations
  return uniqueMatches.filter((m) => !!m.invite && !!m.availability).map(toMatchDTO);
}

// Additional service methods for new routes

/**
 * List upcoming matches for a user (scheduledAt > now)
 */
export async function listUpcomingMatchesForUser(userId: string): Promise<MatchDTO[]> {
  const now = new Date();
  const player = await prisma.player.findUnique({ where: { userId } });
  const orConditions: any[] = [
    { invite: { inviterId: userId } },
    { availability: { userId } },
  ];
  if (player) {
    orConditions.push({ playerAId: player.id });
    orConditions.push({ playerBId: player.id });
  }
  const matches = await prisma.match.findMany({
    where: {
      OR: orConditions,
      scheduledAt: { gt: now },
    },
    include: { invite: true, availability: true },
    orderBy: { scheduledAt: 'asc' },
  });
  const uniqueMatches = Array.from(new Map(matches.map((m) => [m.id, m])).values());
  return uniqueMatches.filter((m) => !!m.invite && !!m.availability).map(toMatchDTO);
}


/**
 * List past matches for a user (scheduledAt < now)
 */
export async function listPastMatchesForUser(userId: string): Promise<MatchDTO[]> {
  const now = new Date();
  const player = await prisma.player.findUnique({ where: { userId } });
  const orConditions: any[] = [
    { invite: { inviterId: userId } },
    { availability: { userId } },
  ];
  if (player) {
    orConditions.push({ playerAId: player.id });
    orConditions.push({ playerBId: player.id });
  }
  const matches = await prisma.match.findMany({
    where: {
      OR: orConditions,
      scheduledAt: { lt: now },
    },
    include: { invite: true, availability: true },
    orderBy: { scheduledAt: 'desc' },
  });
  const uniqueMatches = Array.from(new Map(matches.map((m) => [m.id, m])).values());
  return uniqueMatches.filter((m) => !!m.invite && !!m.availability).map(toMatchDTO);
}


/**
 * List matches for a specific venue
 */
export async function listMatchesForVenue(venueId: string): Promise<MatchDTO[]> {
  const matches = await prisma.match.findMany({
    where: { venueId },
    include: { invite: true, availability: true },
    orderBy: { scheduledAt: 'desc' },
  });
  return matches.filter((m) => !!m.invite && !!m.availability).map(toMatchDTO);
}


/**
 * List the most recent matches, optionally filtered by userId
 */
export async function listRecentMatches(limit: number, userId?: string): Promise<MatchDTO[]> {
  let where: any = {};
  if (userId) {
    const player = await prisma.player.findUnique({ where: { userId } });
    const orConditions: any[] = [
      { invite: { inviterId: userId } },
      { availability: { userId } },
    ];
    if (player) {
      orConditions.push({ playerAId: player.id });
      orConditions.push({ playerBId: player.id });
    }
    where.OR = orConditions;
  }
  const matches = await prisma.match.findMany({
    where,
    include: { invite: true, availability: true },
    orderBy: { scheduledAt: 'desc' },
    take: limit,
  });
  return matches.filter((m) => !!m.invite && !!m.availability).map(toMatchDTO);
}

/**
 * Complete a match (scheduled -> completed)
 * Only allowed if:
 *   - Match exists
 *   - status is scheduled
 *   - scheduledAt is in the past
 *   - Result exists and has at least 1 SetResult
 * Throws AppError on invalid transition.
 */
export async function completeMatch(matchId: string): Promise<MatchDTO> {
  // 1. Complete the match and update ratings inside a transaction
  const updatedMatch = await prisma.$transaction(async (tx) => {
    const match = await tx.match.findUnique({ where: { id: matchId } });
    if (!match) throw new AppError('Match not found', 404);
    // Block completion if match is disputed
    if (match.status === 'disputed') {
      throw new AppError('Cannot complete a disputed match', 400);
    }
    if (match.status !== 'scheduled') throw new AppError('Match cannot be completed from current state', 409);
    const now = new Date();
    if (match.scheduledAt > now) throw new AppError('Match cannot be completed before scheduled time', 409);
    const result = await tx.result.findUnique({ where: { matchId: match.id }, include: { sets: true } });
    if (!result) throw new AppError('Cannot complete match: Result does not exist', 409);
    if (!result.sets || result.sets.length === 0) throw new AppError('Cannot complete match: Result has no set results', 409);

    // Only allow completion if result.status === 'confirmed'
    if (result.status !== 'confirmed') {
      throw new AppError('Match cannot be completed until result is confirmed by both players', 409);
    }

    // Defensive: Enforce lifecycle consistency
    if (result.status === 'confirmed' && match.status !== 'scheduled') {
      throw new AppError('Lifecycle inconsistency: Result is confirmed but Match is not in scheduled state for completion', 409);
    }
    // Atomic transition protection
    const updateResult = await tx.match.updateMany({
      where: { id: match.id, status: 'scheduled' },
      data: { status: 'completed' }
    });
    if (updateResult.count === 0) throw new AppError('Match already completed or invalid state', 409);
    // Update ratings for both players after match is completed
    await RatingService.updateRatingsForCompletedMatch(tx, match.id);
    const updated = await tx.match.findUnique({ where: { id: match.id } });
    // Defensive: After transition, check consistency
    const finalResult = await tx.result.findUnique({ where: { matchId: match.id } });
    const finalMatch = updated;
    if (finalResult?.status === 'confirmed' && finalMatch?.status !== 'completed') {
      throw new AppError('Lifecycle inconsistency: Result is confirmed but Match is not completed', 409);
    }
    if (finalResult?.status !== 'confirmed' && finalMatch?.status === 'completed') {
      throw new AppError('Lifecycle inconsistency: Match is completed but Result is not confirmed', 409);
    }
    return updated!;
  });

  // 2. Send notifications as a side effect (outside transaction)
  // Defensive: Only notify if both playerAId and playerBId exist
  if (updatedMatch.playerAId && updatedMatch.playerBId) {
    // Fetch winnerUserId from result
    const result = await prisma.result.findUnique({ where: { matchId: updatedMatch.id } });
    const winnerUserId = result?.winnerUserId ?? null;
    const notificationPayload = { matchId: updatedMatch.id, winnerId: winnerUserId };
    // Notify both players (if userId is available)
    const playerA = await prisma.player.findUnique({ where: { id: updatedMatch.playerAId } });
    const playerB = await prisma.player.findUnique({ where: { id: updatedMatch.playerBId } });
    if (playerA?.userId) {
      await createNotification(playerA.userId, 'match.completed', notificationPayload);
    }
    if (playerB?.userId && playerB.userId !== playerA?.userId) {
      await createNotification(playerB.userId, 'match.completed', notificationPayload);
    }
  }
  return toMatchDTO(updatedMatch);
}


/**
 * Cancel a match (scheduled -> cancelled)
 * Only allowed if:
 *   - Match exists
 *   - Only hostUserId can cancel
 *   - status is scheduled
 *   - Now is before scheduledAt
 * Throws AppError on invalid transition.
 */
export async function cancelMatch(matchId: string, userId: string): Promise<MatchDTO> {
  return await prisma.$transaction(async (tx) => {
    const match = await tx.match.findUnique({ where: { id: matchId } });
    if (!match) throw new AppError('Match not found', 404);
    if (!('status' in match)) throw new AppError('Match missing status field (migration not applied)', 500);
    if (match.status !== 'scheduled') {
      throw new AppError('Match cannot be cancelled: not in scheduled state', 409);
    }
    if (match.hostUserId !== userId) {
      throw new AppError('Only the host can cancel this match', 403);
    }
    const now = new Date();
    if (now >= match.scheduledAt) {
      throw new AppError('Cannot cancel match after scheduled time', 409);
    }
    // Update status
    const updated = await tx.match.update({ where: { id: match.id }, data: { status: 'cancelled' as MatchStatus } });
    // TODO: Trigger notifications as side effect (after commit)
    return toMatchDTO(updated);
  });
}

/**
 * Create a new match with the provided input data.
 *
 * Requires hostUserId, opponentUserId, scheduledAt, and availabilityId. Optionally connects venue, playerA, playerB, and invite if provided.
 * Throws AppError if required fields are missing. Uses Prisma's checked MatchCreateInput with nested connect for all relations.
 *
 * @param input - The match creation input, including user IDs, scheduled time, and relation IDs.
 * @returns The created MatchDTO.
 * @throws AppError if required fields are missing or validation fails.
 */
export async function createMatch(input: CreateMatchInput): Promise<MatchDTO> {
  // Basic validation (should be expanded for production)
  if (!input.hostUserId || !input.opponentUserId || !input.scheduledAt) {
    throw new AppError('Missing required fields: hostUserId, opponentUserId, scheduledAt', 400);
  }
  // Use Prisma MatchCreateInput with nested connect for relations
  if (!input.availabilityId) {
    throw new AppError('Missing required field: availabilityId', 400);
  }
  const data: Prisma.MatchCreateInput = {
    hostUser: { connect: { id: input.hostUserId } },
    opponentUser: { connect: { id: input.opponentUserId } },
    scheduledAt: new Date(input.scheduledAt),
    status: 'scheduled',
    availability: { connect: { id: input.availabilityId } },
  };
  if (input.venueId) data.venue = { connect: { id: input.venueId } };
  if (input.playerAId) data.playerA = { connect: { id: input.playerAId } };
  if (input.playerBId) data.playerB = { connect: { id: input.playerBId } };
  if (input.inviteId) data.invite = { connect: { id: input.inviteId } };
  const match = await prisma.match.create({ data });
  return toMatchDTO(match);
}



// Helper: convert DB Match to API MatchDTO
// Defensive: expects match.invite and match.availability to be present
function toMatchDTO(match: Match): MatchDTO {
  return {
    id: match.id,
    inviteId: match.inviteId,
    availabilityId: match.availabilityId,
    venueId: match.venueId,
    playerAId: match.playerAId,
    playerBId: match.playerBId,
    hostUserId: match.hostUserId,
    opponentUserId: match.opponentUserId,
    scheduledAt: match.scheduledAt instanceof Date ? match.scheduledAt.toISOString() : String(match.scheduledAt),
    createdAt: match.createdAt instanceof Date ? match.createdAt.toISOString() : String(match.createdAt),
    status: match.status,
  };
}