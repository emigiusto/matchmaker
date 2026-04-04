// matches.service.ts
// Read-only service for Match entities.
// Matches are derived and immutable: they are only created via Invite confirmation (see Invites module) and never modified directly.
// No creation or mutation logic here. No WhatsApp or external messaging logic.
// Guest fallback: playerA/playerB may be null for guest users or incomplete data.

import crypto from 'crypto';
import { AppError } from '../../shared/errors/AppError';
import { prisma } from '../../prisma';
import { logger } from '../../config/logger';
import { MatchDTO, CreateMatchInput } from './matches.types';
import { Match, MatchStatus, Prisma } from '@prisma/client';
import { RatingService } from '../rating/rating.service';
import { createNotification } from '../notifications/notifications.service';
import { validateResultMatchConsistency } from '../results/results.service';
import { logServerEvent } from '../analytics/analytics.service';
import { whatsappService } from '../whatsapp/whatsapp.service';
import { getMessages, resolveLocale } from '../../lib/whatsapp-messages';
import { resolveGroupMessageLocale } from '../../lib/locale-helpers';
import { cancelBookingForMatch, resetBookingForReschedule } from '../booking/booking.service';

const FRONTEND_BASE = process.env.FRONTEND_BASE_URL || 'https://matchmaker-flame.vercel.app';

/** Format a UTC Date as "HH:mm" in the given IANA timezone, falling back to UTC. */
function formatTimeInTz(date: Date, timezone: string): string {
  try {
    return date.toLocaleString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: timezone });
  } catch {
    return date.toLocaleString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'UTC' });
  }
}

/**
 * Fetch a match by its ID. Throws AppError if not found.
 * Invariant: A Match always has a valid Invite and Availability.
 */
const matchInclude = {
  availability: true,
  schedulingRequest: { select: { sportType: true, format: true, timezone: true, bookingEnabled: true } },
  participants: { include: { user: { select: { id: true, name: true } } } },
  result: {
    select: {
      id: true,
      matchId: true,
      status: true,
      winnerUserId: true,
      submittedByUserId: true,
      confirmedByHostAt: true,
      confirmedByOpponentAt: true,
      disputedByHostAt: true,
      disputedByOpponentAt: true,
      disputeNote: true,
      aceupSyncedAt: true,
      aceupChallengeId: true,
      createdAt: true,
      sets: { select: { setNumber: true, playerAScore: true, playerBScore: true }, orderBy: { setNumber: 'asc' as const } },
    },
  },
} as const;

export async function getMatchByPublicToken(token: string): Promise<MatchDTO> {
  const match = await prisma.match.findUnique({
    where: { publicToken: token },
    include: matchInclude,
  });
  if (!match) throw new AppError('Match not found', 404);
  if (!match.availability) throw new AppError('Invariant violation: Match missing Availability', 500);
  return toMatchDTO(match);
}

export async function getMatchById(matchId: string): Promise<MatchDTO> {
  const match = await prisma.match.findUnique({
    where: { id: matchId },
    include: matchInclude,
  });
  if (!match) throw new AppError('Match not found', 404);
  if (!match.availability) throw new AppError('Invariant violation: Match missing Availability', 500);
  return toMatchDTO(match);
}

export async function getWhatsappGroupLink(matchId: string): Promise<string> {
  const match = await prisma.match.findUnique({ where: { id: matchId }, select: { whatsappGroupId: true } });
  if (!match) throw new AppError('Match not found', 404);
  if (!match.whatsappGroupId) throw new AppError('No WhatsApp group for this match', 404);
  const result = await whatsappService.getGroupInviteLink(match.whatsappGroupId);
  if (!result.success || !result.inviteLink) throw new AppError(`Could not get group invite link: ${result.error ?? 'No link returned'}`, 502);
  return result.inviteLink;
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

  const orConditions: Prisma.MatchWhereInput[] = [
    { availability: { userId } },
    { participants: { some: { userId } } },
  ];
  if (player) {
    orConditions.push({ playerAId: player.id });
    orConditions.push({ playerBId: player.id });
  }

  // Defensive: Always fetch related Availability, sort, and deduplicate
  const matches = await prisma.match.findMany({
    where: { OR: orConditions },
    include: matchInclude,
    orderBy: { scheduledAt: 'desc' },
  });
  // Deduplicate by match.id (in case of overlapping conditions)
  const uniqueMatches = Array.from(new Map(matches.map((m) => [m.id, m])).values());
  // Defensive: filter out any matches missing required relations
  return uniqueMatches.filter((m) => !!m.availability).map(toMatchDTO);
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
    include: matchInclude,
    orderBy: { scheduledAt: 'desc' },
  });
  // Deduplicate by match.id (should not be needed, but defensive)
  const uniqueMatches = Array.from(new Map(matches.map((m) => [m.id, m])).values());
  // Defensive: filter out any matches missing required relations
  return uniqueMatches.filter((m) => !!m.availability).map(toMatchDTO);
}

// Additional service methods for new routes

/**
 * List upcoming matches for a user (scheduledAt > now)
 */
export async function listUpcomingMatchesForUser(userId: string): Promise<MatchDTO[]> {
  const now = new Date();
  const player = await prisma.player.findUnique({ where: { userId } });
  const orConditions: Prisma.MatchWhereInput[] = [
    { availability: { userId } },
    { participants: { some: { userId } } },
  ];
  if (player) {
    orConditions.push({ playerAId: player.id });
    orConditions.push({ playerBId: player.id });
  }
  const matches = await prisma.match.findMany({
    where: {
      OR: orConditions,
      scheduledAt: { gt: now },
      status: { not: 'cancelled' },
    },
    include: matchInclude,
    orderBy: { scheduledAt: 'asc' },
  });
  const uniqueMatches = Array.from(new Map(matches.map((m) => [m.id, m])).values());
  return uniqueMatches.filter((m) => !!m.availability).map(toMatchDTO);
}


/**
 * List past matches for a user (scheduledAt < now)
 */
export async function listPastMatchesForUser(userId: string): Promise<MatchDTO[]> {
  const now = new Date();
  const player = await prisma.player.findUnique({ where: { userId } });
  const orConditions: Prisma.MatchWhereInput[] = [
    { availability: { userId } },
    { participants: { some: { userId } } },
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
    include: matchInclude,
    orderBy: { scheduledAt: 'desc' },
  });
  const uniqueMatches = Array.from(new Map(matches.map((m) => [m.id, m])).values());
  return uniqueMatches.filter((m) => !!m.availability).map(toMatchDTO);
}


/**
 * List matches for a specific venue
 */
export async function listMatchesForVenue(venueId: string): Promise<MatchDTO[]> {
  const matches = await prisma.match.findMany({
    where: { venueId },
    include: matchInclude,
    orderBy: { scheduledAt: 'desc' },
  });
  return matches.filter((m) => !!m.availability).map(toMatchDTO);
}


/**
 * List the most recent matches, optionally filtered by userId
 */
export async function listRecentMatches(limit: number, userId?: string): Promise<MatchDTO[]> {
  let where: Prisma.MatchWhereInput = {};
  if (userId) {
    const player = await prisma.player.findUnique({ where: { userId } });
    const orConditions: Prisma.MatchWhereInput[] = [
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
    include: matchInclude,
    orderBy: { scheduledAt: 'desc' },
    take: limit,
  });
  return matches.filter((m) => !!m.availability).map(toMatchDTO);
}

/**
 * ADMIN-ONLY manual override: Complete a match (scheduled -> completed)
 *
 * This is a safety recovery mechanism, not part of the mainstream flow.
 * Only allowed if:
 *   - Admin privilege (isAdmin === true)
 *   - Match exists
 *   - Match status is 'scheduled'
 *   - Result exists and is 'confirmed'
 *
 * Does NOT trigger rating update or notifications if match is already completed.
 * Throws AppError on invalid transition.
 */
export async function completeMatch(matchId: string, currentUserId: string, isAdmin: boolean): Promise<MatchDTO> {
  if (!isAdmin) throw new AppError('Forbidden: Admins only', 403);

  // Admin-only: Complete the match as a recovery override, inside a transaction
  const updatedMatch = await prisma.$transaction(async (tx) => {
    const match = await tx.match.findUnique({ where: { id: matchId } });
    if (!match) throw new AppError('Match not found', 404);
    if (match.status === 'disputed') {
      throw new AppError('Cannot complete a disputed match', 400);
    }

    // If already completed, do not trigger rating or notifications, just return
    if (match.status === 'completed') {
      return match;
    }

    // Only allow completion if match.status is 'scheduled'
    if (match.status !== 'scheduled') {
      throw new AppError('Match cannot be completed from current state', 409);
    }

    const now = new Date();
    if (match.scheduledAt > now) throw new AppError('Match cannot be completed before scheduled time', 409);

    // Require match.type to be present
    if (!match.type) {
      throw new AppError('Match type missing', 500);
    }

    if (match.type === 'practice') {
      // Practice: allow completion without requiring result
      const updateResult = await tx.match.updateMany({
        where: { id: match.id, status: 'scheduled' },
        data: { status: 'completed' }
      });
      if (updateResult.count === 0) throw new AppError('Match already completed or invalid state', 409);
      const updated = await tx.match.findUnique({ where: { id: match.id } });
      return updated!;
    }

    if (match.type === 'competitive') {
      // Competitive: strict validation
      const result = await tx.result.findUnique({ where: { matchId: match.id }, include: { sets: true } });
      if (!result) throw new AppError('Cannot complete match: Result does not exist', 409);
      if (!result.sets || result.sets.length === 0) throw new AppError('Cannot complete match: Result has no set results', 409);

      // Only allow completion if result.status === 'confirmed'
      if (result.status !== 'confirmed') {
        throw new AppError('Match cannot be completed until result is confirmed by both players', 409);
      }

      // Defensive: Enforce lifecycle consistency
      validateResultMatchConsistency(result, match);

      // Atomic transition protection
      const updateResult = await tx.match.updateMany({
        where: { id: match.id, status: 'scheduled' },
        data: { status: 'completed' }
      });
      if (updateResult.count === 0) throw new AppError('Match already completed or invalid state', 409);

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
    }

    // If match.type is unknown, throw
    throw new AppError('Unknown match type', 500);
  });

  // No rating update or notifications here; handled by mainstream flow (confirmResult)
  void logServerEvent(currentUserId, 'match.completed', { matchId: updatedMatch.id })
  return toMatchDTO(updatedMatch);
}


/**
 * Cancel a match (scheduled -> cancelled)
 * Only allowed if:
 *   - Match exists
 *   - User is a participant in the match
 *   - status is scheduled
 *   - Now is before scheduledAt
 * Throws AppError on invalid transition.
 */
export async function cancelMatch(matchId: string, userId: string): Promise<MatchDTO> {
  return await prisma.$transaction(async (tx) => {
    const match = await tx.match.findUnique({
      where: { id: matchId },
      include: {
        availability: { select: { userId: true } },
        participants: { select: { userId: true } },
      },
    });
    if (!match) throw new AppError('Match not found', 404);
    if (!('status' in match)) throw new AppError('Match missing status field (migration not applied)', 500);
    if (match.status !== 'scheduled') {
      throw new AppError('Match cannot be cancelled: not in scheduled state', 409);
    }
    const participantUserIds = (match as any).participants?.map((p: { userId: string }) => p.userId) ?? [];
    const isParticipant = participantUserIds.includes(userId);
    if (!isParticipant) {
      throw new AppError('Only participants can cancel this match', 403);
    }
    const now = new Date();
    if (now >= match.scheduledAt) {
      throw new AppError('Cannot cancel match after scheduled time', 409);
    }
    // Update status
    const hostUserId = match.availability?.userId ?? null;
    const updated = await tx.match.update({
      where: { id: match.id },
      data: { status: 'cancelled' as MatchStatus },
      include: matchInclude,
    });
    const dto = toMatchDTO(updated);
    void logServerEvent(userId, 'match.cancelled', { matchId: match.id })
    // Notify participants and WhatsApp group (outside tx; failures logged, don't affect cancel)
    notifyMatchParticipantsOnCancel(updated as EnrichedMatch & { whatsappGroupId?: string | null }).catch((err) => {
      logger.error('Failed to notify on match cancel', { matchId: updated.id, error: err instanceof Error ? err.message : String(err) });
    });
    // Trigger booking cancellation if a successful booking exists
    if (hostUserId) {
      cancelBookingOnMatchCancel(matchId, hostUserId).catch((err) => {
        logger.error('Unexpected error in cancelBookingOnMatchCancel', { matchId, error: err instanceof Error ? err.message : String(err) });
      });
    }
    return dto;
  });
}

/**
 * Fire-and-forget: cancels the court booking for a match (if any) and notifies the host.
 * Silently skips if there is no booking or the booking is not in a cancellable state.
 */
async function cancelBookingOnMatchCancel(matchId: string, hostUserId: string): Promise<void> {
  try {
    await cancelBookingForMatch(matchId);
    await createNotification(hostUserId, 'booking.cancelled', { matchId }).catch((err) => {
      logger.warn('Failed to send booking.cancelled notification', { matchId, error: err instanceof Error ? err.message : String(err) });
    });
  } catch (err) {
    if (err instanceof AppError && (err.statusCode === 404 || err.statusCode === 409)) {
      // No booking to cancel or not in a cancellable state — silently skip
      return;
    }
    await createNotification(hostUserId, 'booking.cancel_failed', {
      matchId,
      error: err instanceof Error ? err.message : String(err),
    }).catch((notifErr) => {
      logger.warn('Failed to send booking.cancel_failed notification', { matchId, error: notifErr instanceof Error ? notifErr.message : String(notifErr) });
    });
    logger.error('Failed to cancel booking on match cancel', { matchId, error: err instanceof Error ? err.message : String(err) });
  }
}

/**
 * Reschedule a match to a new date/time.
 * Only participants can reschedule; only scheduled matches can be rescheduled.
 * Fires-and-forgets a booking reset (cancel old + rebook) if auto-booking is active.
 */
export async function rescheduleMatch(matchId: string, userId: string, scheduledAt: string, cancelBooking?: boolean): Promise<MatchDTO> {
  const newTime = new Date(scheduledAt)
  if (isNaN(newTime.getTime())) throw new AppError('Invalid scheduledAt value', 400)
  if (newTime <= new Date()) throw new AppError('New scheduled time must be in the future', 400)

  let timezone = 'UTC'
  const dto = await prisma.$transaction(async (tx) => {
    const match = await tx.match.findUnique({
      where: { id: matchId },
      include: {
        availability: true,
        participants: { select: { userId: true } },
        schedulingRequest: { select: { sportType: true, format: true, timezone: true } },
      },
    })
    if (!match) throw new AppError('Match not found', 404)
    if (match.status !== 'scheduled') throw new AppError('Only scheduled matches can be rescheduled', 409)

    const isParticipant = (match as any).participants?.some((p: { userId: string }) => p.userId === userId)
    if (!isParticipant) throw new AppError('Only participants can reschedule this match', 403)

    if (newTime.getTime() === match.scheduledAt.getTime()) {
      throw new AppError('New time is the same as the current scheduled time', 400)
    }

    timezone = (match as any).schedulingRequest?.timezone ?? 'UTC'

    const updated = await tx.match.update({
      where: { id: matchId },
      data: { scheduledAt: newTime },
      include: matchInclude,
    })

    // Keep Availability.startTime in sync so date/time derived fields stay consistent
    if (match.availabilityId) {
      await tx.availability.update({
        where: { id: match.availabilityId },
        data: { startTime: newTime, date: newTime },
      })
    }

    // Delete stale pending reminders (they were scheduled against the old time)
    await tx.reminder.deleteMany({
      where: { matchId, status: 'pending' },
    })

    return toMatchDTO(updated as EnrichedMatch)
  })

  // Fire-and-forget: cancel old booking and rebook for new time — only if user opted in
  if (cancelBooking) {
    resetBookingForReschedule(matchId).catch((err) => {
      logger.error('Failed to reset booking on reschedule', { matchId, error: err instanceof Error ? err.message : String(err) })
    })
  }

  // Notify all participants + send WhatsApp message + rename group
  notifyMatchParticipantsOnReschedule(matchId, dto, timezone).catch((err) => {
    logger.error('Failed to notify on match reschedule', { matchId, error: err instanceof Error ? err.message : String(err) })
  })

  return dto
}

async function notifyMatchParticipantsOnReschedule(matchId: string, match: MatchDTO, timezone: string): Promise<void> {
  const participants = match.participants ?? []
  for (const p of participants) {
    const opponentNames = participants
      .filter((o) => o.userId !== p.userId)
      .map((o) => o.userName ?? 'Opponent')
      .filter(Boolean)
      .join(', ')
    try {
      await createNotification(p.userId, 'match.rescheduled', {
        matchId: match.id,
        scheduledAt: match.scheduledAt,
        date: match.date,
        time: match.time,
        location: match.location,
        opponentNames: opponentNames || undefined,
      })
    } catch (err) {
      logger.error('Failed to create match.rescheduled notification', {
        userId: p.userId,
        matchId,
        error: err instanceof Error ? err.message : String(err),
      })
    }
  }

  const groupId = (match as any).whatsappGroupId as string | null | undefined
  if (!groupId) return

  try {
    const tz = timezone
    const scheduled = new Date(match.scheduledAt)
    const hostUserId = match.hostUserId ?? participants[0]?.userId ?? ''
    const hostLocale = await resolveGroupMessageLocale(hostUserId, participants.map((p) => p.userId), match.format ?? 'singles')
    const intlLocale = resolveLocale(hostLocale) === 'es' ? 'es-ES' : 'en-US'

    const dateStr = scheduled.toLocaleDateString(intlLocale, { weekday: 'long', day: 'numeric', month: 'long', timeZone: tz })
    const timeStr = formatTimeInTz(scheduled, tz)
    const whenStr = `${dateStr.charAt(0).toUpperCase()}${dateStr.slice(1)} · ${timeStr}`
    const loc = match.location ?? ''
    const matchUrl = `${FRONTEND_BASE.replace(/\/$/, '')}/#/matches/${match.id}`

    // Send WhatsApp message with new time
    const message = getMessages(hostLocale).matchRescheduled(whenStr, loc, matchUrl)
    await whatsappService.sendGroupMessage(groupId, message)

    // Rename group to reflect new date/time
    const participantNames = participants
      .map((p) => p.userName)
      .filter((n): n is string => !!n)
      .map((n) => n.trim().split(/\s+/)[0] ?? n)
    const nameLabel = (match.format ?? 'singles') !== 'doubles' && participantNames.length > 0
      ? participantNames.join(' · ')
      : null
    const newGroupName = nameLabel
      ? `${whenStr} · ${nameLabel}`
      : whenStr
    await whatsappService.updateGroupSubject(groupId, newGroupName)

    logger.info('MatchRescheduledWhatsAppSent', { matchId, groupId, newGroupName })
  } catch (err) {
    logger.error('Failed to send WhatsApp group message for rescheduled match', {
      matchId,
      error: err instanceof Error ? err.message : String(err),
    })
  }
}

/**
 * Create a new match with the provided input data.
 *
 * Requires participantUserIds, scheduledAt, availabilityId, and type. Optionally connects venue, playerA, playerB, and invite.
 * Throws AppError if required fields are missing. Uses Prisma's checked MatchCreateInput with nested connect for all relations.
 *
 * @param input - The match creation input, including user IDs, scheduled time, and relation IDs.
 * @param tx - Optional Prisma transaction client for atomic operations.
 * @returns The created MatchDTO.
 * @throws AppError if required fields are missing or validation fails.
 */
export async function createMatch(
  input: CreateMatchInput,
  tx?: Prisma.TransactionClient
): Promise<MatchDTO> {
  if (!input.participantUserIds?.length || !input.scheduledAt || !input.availabilityId) {
    throw new AppError('Missing required fields: participantUserIds, scheduledAt, availabilityId', 400);
  }
  const matchType = input.type ?? 'competitive';
  if (matchType !== 'competitive' && matchType !== 'practice') {
    throw new AppError('Invalid match type. Must be "competitive" or "practice".', 400);
  }

  const db = tx ?? prisma;
  const uniqueIds = [...new Set(input.participantUserIds)];
  const data: Prisma.MatchCreateInput = {
    scheduledAt: new Date(input.scheduledAt),
    status: 'scheduled',
    availability: { connect: { id: input.availabilityId } },
    type: matchType,
    publicToken: crypto.randomBytes(32).toString('base64url'),
    participants: {
      create: uniqueIds.map((userId) => ({ userId, team: null })),
    },
  };
  if (input.venueId) data.venue = { connect: { id: input.venueId } };
  if (input.playerAId) data.playerA = { connect: { id: input.playerAId } };
  if (input.playerBId) data.playerB = { connect: { id: input.playerBId } };

  const match = await db.match.create({
    data,
    include: { participants: { include: { user: { select: { id: true, name: true } } } }, availability: true },
  });
  // Log for each participant
  for (const p of uniqueIds) {
    void logServerEvent(p, 'match.created', { matchId: match.id })
  }
  return toMatchDTO(match);
}

/**
 * Notify all match participants that a match was cancelled.
 * Creates in-app notifications and sends WhatsApp message to the group if it exists.
 * Failures are logged but do not affect the cancel operation.
 */
async function notifyMatchParticipantsOnCancel(match: EnrichedMatch & { whatsappGroupId?: string | null }): Promise<void> {
  const av = match.availability;
  const tz = (match as any).schedulingRequest?.timezone ?? 'UTC';
  const dateStr = av?.date ? new Date(av.date).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'short' }) : 'TBD';
  const timeStr = av?.startTime ? formatTimeInTz(av.startTime instanceof Date ? av.startTime : new Date(av.startTime), tz) : '';
  const location = av?.locationText ?? 'TBD';
  const participants = (match as any).participants ?? [];

  for (const p of participants) {
    const opponentNames = participants
      .filter((o: any) => o.userId !== p.userId)
      .map((o: any) => o.user?.name ?? o.userName ?? 'Opponent')
      .filter(Boolean)
      .join(', ');
    const payload = {
      matchId: match.id,
      date: av?.date ? new Date(av.date).toISOString().slice(0, 10) : undefined,
      time: timeStr || undefined,
      location,
      opponentNames: opponentNames || undefined,
    };
    try {
      await createNotification(p.userId, 'match.cancelled', payload);
    } catch (err) {
      logger.error('Failed to create match.cancelled notification', {
        userId: p.userId,
        matchId: match.id,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  const groupId = match.whatsappGroupId;
  if (groupId && groupId.trim()) {
    try {
      const hostUserId = (match.availability as any)?.userId as string | undefined;
      const participantIds = ((match as any).participants as { userId: string }[] | undefined)?.map((p) => p.userId) ?? [];
      const sport = (match as any).schedulingRequest?.sportType ?? 'tennis';
      const format = (match as any).schedulingRequest?.format ?? 'singles';
      const hostLocale = hostUserId
        ? await resolveGroupMessageLocale(hostUserId, participantIds, format)
        : 'es';
      const intlLocale = resolveLocale(hostLocale) === 'es' ? 'es-ES' : 'en-US';
      const rawDateStr = av?.date
        ? new Date(av.date).toLocaleDateString(intlLocale, { weekday: 'long', day: 'numeric', month: 'short' })
        : 'TBD';
      const localeDateStr = rawDateStr.charAt(0).toUpperCase() + rawDateStr.slice(1);
      const whenStr = `${localeDateStr}${timeStr ? ` · ${timeStr}` : ''}`;
      const participantNames = ((match as any).participants as { user?: { name: string | null } }[] | undefined)
        ?.map((p) => p.user?.name)
        .filter((n): n is string => Boolean(n)) ?? [];
      const participantsStr = participantNames.join(', ') || '—';
      const matchUrl = `${FRONTEND_BASE.replace(/\/$/, '')}/#/matches/${match.id}`;
      const message = getMessages(hostLocale).matchCancelled(sport, format, whenStr, location, participantsStr, matchUrl);
      await whatsappService.sendGroupMessage(groupId, message);
      logger.info('MatchCancelledWhatsAppSent', { matchId: match.id, groupId });
    } catch (err) {
      logger.error('Failed to send WhatsApp group message for cancelled match', {
        matchId: match.id,
        groupId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
}

/**
 * Notify all match participants that a match was created.
 * Called as a side effect after match creation; failures are logged but do not affect the match.
 */
export async function notifyMatchParticipantsOnCreate(match: MatchDTO, timezone?: string): Promise<void> {
  const tz = timezone ?? 'UTC';
  const scheduled = new Date(match.scheduledAt);
  const localDate = scheduled.toLocaleDateString('en-CA', { timeZone: tz });
  const localTime = scheduled.toLocaleString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: tz });

  for (const p of match.participants) {
    const opponentNames = match.participants
      .filter((o) => o.userId !== p.userId)
      .map((o) => o.userName ?? 'Opponent')
      .filter(Boolean);
    const payload = {
      matchId: match.id,
      scheduledAt: match.scheduledAt,
      location: match.location,
      date: localDate,
      time: localTime,
      opponentNames: opponentNames.join(', '),
    };
    try {
      await createNotification(p.userId, 'match.created', payload);
    } catch (err) {
      logger.error('Failed to create match.created notification', {
        userId: p.userId,
        matchId: match.id,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
}



type EnrichedMatch = Match & {
  availability?: { locationText: string; date: Date; startTime: Date; endTime: Date; userId: string } | null;
  schedulingRequest?: { sportType: string; format: string; timezone?: string | null; bookingEnabled?: boolean | null } | null;
  participants?: { userId: string; team: string | null; user?: { id: string; name: string | null } }[];
  result?: { id: string; matchId: string; status: string; winnerUserId: string | null; submittedByUserId: string | null; confirmedByHostAt: Date | null; confirmedByOpponentAt: Date | null; disputedByHostAt: Date | null; disputedByOpponentAt: Date | null; disputeNote: string | null; aceupSyncedAt: Date | null; aceupChallengeId: number | null; createdAt: Date; sets: { setNumber: number; playerAScore: number; playerBScore: number }[] } | null;
};

function toMatchDTO(match: EnrichedMatch): MatchDTO {
  const av = match.availability;
  const participants =
    (match as any).participants?.map((p: { userId: string; team: string | null; user?: { name: string | null } }) => ({
      userId: p.userId,
      team: (p.team === 'A' || p.team === 'B' ? p.team : null) as 'A' | 'B' | null,
      userName: p.user?.name ?? undefined,
    })) ?? [];
  const sr = (match as EnrichedMatch).schedulingRequest;
  const participantCount = participants.length;
  const format = (sr?.format === 'doubles' || sr?.format === 'singles' ? sr.format : participantCount >= 4 ? 'doubles' : 'singles') as 'singles' | 'doubles';
  const sportType = (sr?.sportType === 'padel' || sr?.sportType === 'tennis' ? sr.sportType : 'tennis') as 'tennis' | 'padel';
  const tz = sr?.timezone ?? 'UTC';
  const scheduled = match.scheduledAt instanceof Date ? match.scheduledAt : new Date(match.scheduledAt);
  return {
    id: match.id,
    inviteId: null,
    availabilityId: match.availabilityId,
    venueId: match.venueId,
    playerAId: match.playerAId,
    playerBId: match.playerBId,
    participants,
    scheduledAt: scheduled.toISOString(),
    createdAt: match.createdAt instanceof Date ? match.createdAt.toISOString() : String(match.createdAt),
    status: match.status,
    type: match.type || 'competitive',
    sportType,
    format,
    whatsappGroupId: match.whatsappGroupId ?? null,
    publicToken: (match as any).publicToken ?? null,
    bookingEnabled: sr?.bookingEnabled ?? false,
    hostUserId: av?.userId ?? null,
    result: match.result ? {
      id: match.result.id,
      matchId: match.result.matchId,
      status: match.result.status as 'draft' | 'submitted' | 'confirmed' | 'disputed',
      winnerUserId: match.result.winnerUserId ?? null,
      submittedByUserId: match.result.submittedByUserId ?? null,
      confirmedByHostAt: match.result.confirmedByHostAt ? match.result.confirmedByHostAt.toISOString() : null,
      confirmedByOpponentAt: match.result.confirmedByOpponentAt ? match.result.confirmedByOpponentAt.toISOString() : null,
      disputedByHostAt: match.result.disputedByHostAt ? match.result.disputedByHostAt.toISOString() : null,
      disputedByOpponentAt: match.result.disputedByOpponentAt ? match.result.disputedByOpponentAt.toISOString() : null,
      disputeNote: match.result.disputeNote ?? null,
      aceupSyncedAt: match.result.aceupSyncedAt ? match.result.aceupSyncedAt.toISOString() : null,
      aceupChallengeId: match.result.aceupChallengeId ?? null,
      createdAt: match.result.createdAt instanceof Date ? match.result.createdAt.toISOString() : String(match.result.createdAt),
      sets: (match.result.sets ?? []).map((s) => ({
        setNumber: s.setNumber,
        player1Score: s.playerAScore,
        player2Score: s.playerBScore,
      })),
    } : null,
    ...(av && {
      location: av.locationText,
      date: scheduled.toLocaleDateString('en-CA', { timeZone: tz }),
      time: formatTimeInTz(scheduled, tz),
      endTime: formatTimeInTz(av.endTime instanceof Date ? av.endTime : new Date(av.endTime), tz),
    }),
  };
}