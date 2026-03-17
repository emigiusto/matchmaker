// booking.service.ts
// Manages ClubMembership (user credentials per club) and BookingAttempt lifecycle.
// Triggered automatically after a match is confirmed.

import { prisma } from '../../prisma'
import { AppError } from '../../shared/errors/AppError'
import { encrypt, decrypt } from '../../shared/utils/crypto.utils'
import { getAdapter } from './adapters/adapter.registry'
import { logger } from '../../config/logger'
import { whatsappService } from '../whatsapp/whatsapp.service'
import { getMessages } from '../../lib/whatsapp-messages'
import { cacheGet, cacheSet } from '../../shared/cache/redis'
import type {
  UpsertClubMembershipInput,
  ClubMembershipDTO,
  BookingAttemptDTO,
  CourtAvailabilityResult,
} from './booking.types'

// ─── ClubMembership ───────────────────────────────────────────────

export async function upsertClubMembership(
  input: UpsertClubMembershipInput,
): Promise<ClubMembershipDTO> {
  const encryptedPassword = input.password ? encrypt(input.password) : undefined

  const membership = await prisma.clubMembership.upsert({
    where: { userId_clubSlug: { userId: input.userId, clubSlug: input.clubSlug } },
    create: {
      userId: input.userId,
      clubSlug: input.clubSlug,
      adapterType: input.adapterType,
      socioNumber: input.socioNumber,
      encryptedPassword: encryptedPassword ?? null,
      status: 'unverified',
    },
    update: {
      socioNumber: input.socioNumber,
      adapterType: input.adapterType,
      ...(encryptedPassword !== undefined && { encryptedPassword }),
      status: 'unverified',
      lastVerifiedAt: null,
    },
  })

  return toMembershipDTO(membership)
}

export async function getClubMembership(
  userId: string,
  clubSlug: string,
): Promise<ClubMembershipDTO | null> {
  const membership = await prisma.clubMembership.findUnique({
    where: { userId_clubSlug: { userId, clubSlug } },
  })
  return membership ? toMembershipDTO(membership) : null
}

export async function listClubMemberships(userId: string): Promise<ClubMembershipDTO[]> {
  const memberships = await prisma.clubMembership.findMany({ where: { userId } })
  return memberships.map(toMembershipDTO)
}

export async function deleteClubMembership(userId: string, clubSlug: string): Promise<void> {
  const membership = await prisma.clubMembership.findUnique({
    where: { userId_clubSlug: { userId, clubSlug } },
  })
  if (!membership) return

  // Delete referencing BookingAttempt rows first to avoid FK violation
  await prisma.bookingAttempt.deleteMany({
    where: { clubMembershipId: membership.id },
  })

  await prisma.clubMembership.delete({
    where: { id: membership.id },
  })
}

export async function testClubConnection(userId: string, clubSlug: string): Promise<boolean> {
  const membership = await prisma.clubMembership.findUnique({
    where: { userId_clubSlug: { userId, clubSlug } },
  })
  if (!membership) throw new AppError('Club membership not found', 404)
  if (!membership.encryptedPassword) throw new AppError('No password stored for this membership', 400)

  const adapter = getAdapter(membership.adapterType)
  const creds = {
    socioNumber: membership.socioNumber,
    password: decrypt(membership.encryptedPassword),
  }

  const ok = await adapter.testConnection(creds)

  await prisma.clubMembership.update({
    where: { id: membership.id },
    data: {
      status: ok ? 'active' : 'invalid_credentials',
      lastVerifiedAt: new Date(),
    },
  })

  return ok
}

/**
 * Fetch all available courts for a full day and sport.
 * Results are cached in Redis for 15 minutes keyed by club/date/sport (no hour).
 * The frontend filters availableCourts by time to show per-hour counts,
 * so changing the time picker costs zero extra requests within the cache window.
 */
export async function checkCourtAvailability(
  userId: string,
  clubSlug: string,
  date: string,   // YYYY-MM-DD
  sport: string,  // 'tennis' | 'padel'
): Promise<CourtAvailabilityResult> {
  const membership = await prisma.clubMembership.findUnique({
    where: { userId_clubSlug: { userId, clubSlug } },
  })
  if (!membership) throw new AppError('Club membership not found', 404)
  if (!membership.encryptedPassword) throw new AppError('No password stored for this membership', 400)
  if (membership.status !== 'active') throw new AppError('Club membership is not active — please verify your connection in your profile', 400)

  const cacheKey = `matchmaker:booking:availability:${membership.adapterType}:${clubSlug}:${date}:${sport}`

  try {
    const cached = await cacheGet(cacheKey)
    if (cached) {
      logger.info(`[booking] Availability cache hit: ${cacheKey}`)
      return JSON.parse(cached) as CourtAvailabilityResult
    }
  } catch (err) {
    logger.warn('[booking] Cache get failed for availability:', err)
  }

  const adapter = getAdapter(membership.adapterType)
  const creds = {
    socioNumber: membership.socioNumber,
    password: decrypt(membership.encryptedPassword),
  }

  logger.info(`[booking] Checking full-day court availability: clubSlug=${clubSlug}, date=${date}, sport=${sport}`)
  const result = await adapter.checkAvailability(creds, date, undefined, { sport })

  try {
    await cacheSet(cacheKey, JSON.stringify(result), 900)
  } catch (err) {
    logger.warn('[booking] Cache set failed for availability:', err)
  }

  return result
}

// ─── BookingAttempt ───────────────────────────────────────────────

/**
 * Triggered after a match is confirmed.
 * Finds the host's ClubMembership, collects socio numbers from all other participants,
 * and attempts to book a court via the appropriate adapter.
 *
 * If any participant is missing a socio number, the attempt fails immediately.
 */
export async function triggerBookingForMatch(matchId: string): Promise<void> {
  const match = await prisma.match.findUnique({
    where: { id: matchId },
    include: {
      participants: { include: { user: true } },
      availability: true,
    },
  })
  if (!match) throw new AppError('Match not found', 404)

  // Check for existing booking attempt via separate query (avoids relying on include before Prisma client is regenerated)
  const existingAttempt = await prisma.bookingAttempt.findUnique({ where: { matchId } })
  if (existingAttempt) {
    logger.warn(`[booking] Match ${matchId} already has a booking attempt, skipping`)
    return
  }

  // Find host: participant who owns the availability
  const hostUserId = match.availability?.userId
  if (!hostUserId) {
    logger.warn(`[booking] No host userId for match ${matchId}, skipping booking`)
    return
  }

  // Find host ClubMembership — for now use the first active one with a password
  // In the future this could be club-specific based on match venue/location
  const hostMembership = await prisma.clubMembership.findFirst({
    where: {
      userId: hostUserId,
      encryptedPassword: { not: null },
      status: 'active',
    },
  })
  if (!hostMembership) {
    logger.info(`[booking] Host ${hostUserId} has no active club membership, skipping booking`)
    return
  }

  // Create pending BookingAttempt
  const attempt = await prisma.bookingAttempt.create({
    data: {
      matchId,
      clubMembershipId: hostMembership.id,
      status: 'pending',
    },
  })

  // Log booking_pending event to SchedulingRequest history
  logBookingEvent(matchId, 'booking_pending').catch(() => {})

  // Run booking async — don't await so it doesn't block confirmInvite
  runBookingJob(attempt.id, matchId, hostMembership.id).catch((err) => {
    logger.error(`[booking] Unhandled error in booking job for match ${matchId}:`, err)
  })
}

/**
 * Log a booking event to the SchedulingInviteEvent table for the request linked to this match.
 * If the match has no linked SchedulingRequest, the event is silently skipped.
 */
async function logBookingEvent(
  matchId: string,
  action: 'booking_pending' | 'booking_success' | 'booking_failed' | 'booking_cancelled',
  metadata?: Record<string, unknown>,
): Promise<void> {
  try {
    const request = await prisma.schedulingRequest.findUnique({ where: { matchId } })
    if (!request) return
    await prisma.schedulingInviteEvent.create({
      data: {
        schedulingRequestId: request.id,
        action,
        ...(metadata !== undefined && { metadata: metadata as object }),
      },
    })
  } catch (err) {
    logger.warn(`[booking] Failed to log ${action} event for match ${matchId}:`, err)
  }
}

/** Detect network-level errors that indicate the booking system is offline/unreachable */
function isOfflineError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err)
  const offlinePatterns = ['ECONNREFUSED', 'ECONNRESET', 'ETIMEDOUT', 'ENOTFOUND', 'ERR_NAME_NOT_RESOLVED', 'net::ERR']
  return offlinePatterns.some((p) => msg.includes(p))
}

async function runBookingJob(
  attemptId: string,
  matchId: string,
  hostMembershipId: string,
): Promise<void> {
  try {
    const [attempt, match] = await Promise.all([
      prisma.bookingAttempt.findUnique({ where: { id: attemptId } }),
      prisma.match.findUnique({
        where: { id: matchId },
        include: {
          participants: { include: { user: true } },
          availability: true,
        },
      }),
    ])
    if (!attempt || !match) return

    const membership = await prisma.clubMembership.findUnique({
      where: { id: hostMembershipId },
    })
    if (!membership || !membership.encryptedPassword) {
      await failAttempt(attemptId, 'Host membership missing or has no password')
      return
    }

    // Resolve host user ID: prefer scheduling request host, fall back to availability owner
    const schedulingRequest = await prisma.schedulingRequest.findUnique({ where: { matchId } })
    const hostUserId = schedulingRequest?.hostUserId ?? match.availability?.userId ?? membership.userId

    logger.info(`[booking] hostUserId resolved: ${hostUserId} (schedulingRequest=${schedulingRequest?.id ?? 'none'}, availability.userId=${match.availability?.userId ?? 'none'}, membership.userId=${membership.userId})`)

    const otherParticipants = match.participants.filter((p) => p.userId !== hostUserId)
    logger.info(`[booking] Participants: total=${match.participants.length}, other=${otherParticipants.length}, ids=${otherParticipants.map(p => `${p.userId}(${p.user?.name})`).join(', ')}`)

    // Collect socio numbers for other participants
    const participantSocioNumbers: string[] = []
    for (const participant of otherParticipants) {
      logger.info(`[booking] Looking up socio for participant ${participant.user?.name} (userId=${participant.userId}, phone=${participant.user?.phone ?? 'none'})`)

      // 1. Check ClubMembership (registered user with their own club account)
      const participantMembership = await prisma.clubMembership.findFirst({
        where: { userId: participant.userId, clubSlug: membership.clubSlug },
      })
      logger.info(`[booking] ClubMembership lookup: found=${!!participantMembership}, socioNumber=${participantMembership?.socioNumber ?? 'none'}`)
      if (participantMembership?.socioNumber) {
        participantSocioNumbers.push(participantMembership.socioNumber)
        continue
      }

      // 2. Check Contact by phone (socioNumbers JSON map, key = clubSlug)
      const phone = participant.user?.phone
      if (phone) {
        const contact = await prisma.contact.findUnique({
          where: { ownerUserId_phone: { ownerUserId: hostUserId, phone: phone.replace(/\s+/g, '') } },
        })
        const socioNumber = (contact?.socioNumbers as Record<string, string> | null)?.[membership.clubSlug]
        logger.info(`[booking] Contact lookup: participantPhone=${phone}, found=${!!contact}, socioNumber=${socioNumber ?? 'none'}`)
        if (socioNumber) {
          participantSocioNumbers.push(socioNumber)
          continue
        }
      } else {
        logger.info(`[booking] Participant has no phone — skipping Contact lookup`)
      }

      await failAttempt(
        attemptId,
        `Missing socio number for participant ${participant.user?.name ?? participant.userId}`,
      )
      return
    }

    const adapter = getAdapter(membership.adapterType)
    const creds = {
      socioNumber: membership.socioNumber,
      password: decrypt(membership.encryptedPassword),
    }

    const tz = schedulingRequest?.timezone ?? 'UTC'
    const date = match.availability?.date
      ? new Date(match.availability.date).toISOString().slice(0, 10)
      : new Date(match.scheduledAt).toISOString().slice(0, 10)
    const rawTime = match.availability?.startTime
      ? new Date(match.availability.startTime)
      : new Date(match.scheduledAt)
    const time = rawTime.toLocaleString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: tz })

    const sport = schedulingRequest?.sportType ?? 'tennis'
    const sportOptions = { sport }

    // Check availability — use cached full-day result to avoid redundant Puppeteer scrape
    const availCacheKey = `matchmaker:booking:availability:${membership.adapterType}:${membership.clubSlug}:${date}:${sport}`
    let availability: CourtAvailabilityResult | undefined
    try {
      const cached = await cacheGet(availCacheKey)
      if (cached) {
        logger.info(`[booking] Availability cache hit for booking job: ${availCacheKey}`)
        availability = JSON.parse(cached) as CourtAvailabilityResult
      }
    } catch (err) {
      logger.warn('[booking] Cache get failed in booking job:', err)
    }
    if (!availability) {
      availability = await adapter.checkAvailability(creds, date, undefined, sportOptions)
      try {
        await cacheSet(availCacheKey, JSON.stringify(availability), 900)
      } catch (err) {
        logger.warn('[booking] Cache set failed in booking job:', err)
      }
    }

    // Filter courts to the target hour
    const targetHourStr = time.slice(0, 5)  // e.g. "09:00"
    const filteredCourts = availability.availableCourts.filter((c) => c.time === targetHourStr)
    const court = filteredCourts[0] ?? availability.availableCourts[0]
    if (!court) {
      await failAttempt(attemptId, `No available courts at ${date} ${time}`)
      return
    }

    const result = await adapter.book(creds, date, time, court.courtId, participantSocioNumbers, sportOptions)

    await prisma.bookingAttempt.update({
      where: { id: attemptId },
      data: {
        status: 'success',
        externalBookingId: result.externalId,
        courtName: result.courtName,
        completedAt: new Date(),
      },
    })

    logBookingEvent(matchId, 'booking_success', { courtName: result.courtName, externalId: result.externalId }).catch(() => {})
    logger.info(`[booking] Court booked for match ${matchId}: ${result.courtName} (${result.externalId})`)

    // Notify the WhatsApp group
    if (match.whatsappGroupId) {
      const hostUser = await prisma.user.findUnique({ where: { id: hostUserId }, select: { locale: true } }).catch(() => null)
      const hostLocale = hostUser?.locale ?? 'es'
      const message = getMessages(hostLocale).courtBooked(result.courtName, `${date} · ${time}`, match.availability?.locationText ?? '')
      whatsappService.sendGroupMessage(match.whatsappGroupId, message).catch((err) => {
        logger.warn(`[booking] Failed to send WhatsApp group notification for match ${matchId}:`, err)
      })
    }
  } catch (err) {
    const offline = isOfflineError(err)
    const message = offline
      ? 'Club booking system is offline or unreachable'
      : (err instanceof Error ? err.message : String(err))
    await failAttempt(attemptId, message)
    logBookingEvent(matchId, 'booking_failed', { errorMessage: message }).catch(() => {})
    logger.error(`[booking] Booking failed for match ${matchId}: ${message}`)
  }
}

async function failAttempt(attemptId: string, errorMessage: string): Promise<void> {
  await prisma.bookingAttempt.update({
    where: { id: attemptId },
    data: { status: 'failed', errorMessage, completedAt: new Date() },
  }).catch((e) => logger.error(`[booking] Failed to mark attempt ${attemptId} as failed:`, e))
}

/**
 * Retry a failed booking. Resets the existing attempt and re-runs the booking job.
 * Only allowed when the current attempt status is 'failed'.
 */
export async function retryBookingForMatch(matchId: string): Promise<void> {
  const existing = await prisma.bookingAttempt.findUnique({ where: { matchId } })
  if (!existing) throw new AppError('No booking attempt found for this match', 404)
  if (existing.status !== 'failed') {
    throw new AppError(`Cannot retry — booking status is "${existing.status}"`, 409)
  }

  // Reset attempt to pending
  await prisma.bookingAttempt.update({
    where: { id: existing.id },
    data: { status: 'pending', errorMessage: null, completedAt: null, attemptedAt: new Date() },
  })

  logBookingEvent(matchId, 'booking_pending', { retry: true }).catch(() => {})

  runBookingJob(existing.id, matchId, existing.clubMembershipId).catch((err) => {
    logger.error(`[booking] Unhandled error in retry booking job for match ${matchId}:`, err)
  })
}

/**
 * Cancel a successful booking. Only callable when status is 'success'.
 * Uses the host's ClubMembership credentials to cancel via the adapter.
 */
export async function cancelBookingForMatch(matchId: string): Promise<void> {
  const attempt = await prisma.bookingAttempt.findUnique({ where: { matchId } })
  if (!attempt) throw new AppError('No booking attempt found for this match', 404)
  if (attempt.status !== 'success') {
    throw new AppError(`Cannot cancel — booking status is "${attempt.status}"`, 409)
  }
  if (!attempt.externalBookingId) {
    throw new AppError('Booking has no external ID — cannot cancel', 400)
  }

  const membership = await prisma.clubMembership.findUnique({ where: { id: attempt.clubMembershipId } })
  if (!membership || !membership.encryptedPassword) {
    throw new AppError('Host membership missing or has no password', 400)
  }

  const adapter = getAdapter(membership.adapterType)
  const creds = {
    socioNumber: membership.socioNumber,
    password: decrypt(membership.encryptedPassword),
  }

  try {
    await adapter.cancel(creds, attempt.externalBookingId)
  } catch (err) {
    // If the reservation is already gone at the club side, treat as cancelled.
    // Log and continue — the desired end state (no active booking) is already true.
    logger.warn(`[booking] Adapter cancel failed for match ${matchId} (may already be cancelled):`, err instanceof Error ? err.message : err)
  }

  await prisma.bookingAttempt.update({
    where: { id: attempt.id },
    data: { status: 'cancelled', completedAt: new Date(), errorMessage: null },
  })

  logBookingEvent(matchId, 'booking_cancelled').catch(() => {})
  logger.info(`[booking] Booking cancelled for match ${matchId}`)
}

export async function getBookingAttemptByMatch(matchId: string): Promise<BookingAttemptDTO | null> {
  const attempt = await prisma.bookingAttempt.findUnique({ where: { matchId } })
  return attempt ? toAttemptDTO(attempt) : null
}

// ─── Mappers ──────────────────────────────────────────────────────

function toMembershipDTO(m: {
  id: string; userId: string; clubSlug: string; adapterType: string
  socioNumber: string; encryptedPassword: string | null; status: string
  lastVerifiedAt: Date | null; createdAt: Date
}): ClubMembershipDTO {
  return {
    id: m.id,
    userId: m.userId,
    clubSlug: m.clubSlug,
    adapterType: m.adapterType,
    socioNumber: m.socioNumber,
    hasPassword: !!m.encryptedPassword,
    status: m.status,
    lastVerifiedAt: m.lastVerifiedAt?.toISOString() ?? null,
    createdAt: m.createdAt.toISOString(),
  }
}

function toAttemptDTO(a: {
  id: string; matchId: string; clubMembershipId: string; status: string
  externalBookingId: string | null; courtName: string | null
  errorMessage: string | null; attemptedAt: Date; completedAt: Date | null
}): BookingAttemptDTO {
  return {
    id: a.id,
    matchId: a.matchId,
    clubMembershipId: a.clubMembershipId,
    status: a.status,
    externalBookingId: a.externalBookingId,
    courtName: a.courtName,
    errorMessage: a.errorMessage,
    attemptedAt: a.attemptedAt.toISOString(),
    completedAt: a.completedAt?.toISOString() ?? null,
  }
}
