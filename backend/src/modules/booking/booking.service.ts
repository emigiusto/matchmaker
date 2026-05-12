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
import { resolveGroupMessageLocale } from '../../lib/locale-helpers'
import { cacheGet, cacheSet } from '../../shared/cache/redis'
import { createNotification } from '../notifications/notifications.service'
import { logServerEvent } from '../analytics/analytics.service'
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

/**
 * Pure cache read — never triggers a Puppeteer session.
 * Returns the number of available courts per slot for a given date/sport,
 * or null if the cache is cold or the membership is not found.
 */
export async function getCachedCourtsPerSlot(
  userId: string,
  clubSlug: string,
  date: string,   // YYYY-MM-DD
  sport: string,
  slots: string[], // HH:MM[]
): Promise<Record<string, number> | null> {
  try {
    const membership = await prisma.clubMembership.findUnique({
      where: { userId_clubSlug: { userId, clubSlug } },
    })
    if (!membership) return null
    const cacheKey = `matchmaker:booking:availability:${membership.adapterType}:${clubSlug}:${date}:${sport}`
    const cached = await cacheGet(cacheKey)
    if (!cached) return null
    const availability = JSON.parse(cached) as CourtAvailabilityResult
    const result: Record<string, number> = {}
    for (const slot of slots) {
      result[slot] = availability.availableCourts.filter((c) => c.time === slot).length
    }
    return result
  } catch {
    return null
  }
}

// ─── Slot selection ───────────────────────────────────────────────

/**
 * Given a [startTime, endTime) window, returns the earliest HH:MM slot that
 * has at least one court available in the Redis cache.
 * Falls back to startTime if the cache is empty, cold, or no courts are found.
 * Pure cache read — never triggers a Puppeteer session.
 */
export async function pickBestSlotInRange(
  userId: string,
  clubSlug: string,
  date: string,      // YYYY-MM-DD
  sport: string,
  startTime: string, // HH:MM
  endTime: string,   // HH:MM
): Promise<string> {
  try {
    const membership = await prisma.clubMembership.findUnique({
      where: { userId_clubSlug: { userId, clubSlug } },
    })
    if (!membership) return startTime

    const cacheKey = `matchmaker:booking:availability:${membership.adapterType}:${clubSlug}:${date}:${sport}`
    const cached = await cacheGet(cacheKey)
    if (!cached) return startTime

    const availability = JSON.parse(cached) as CourtAvailabilityResult
    const [sh] = startTime.split(':').map(Number)
    const [eh] = endTime.split(':').map(Number)

    for (let h = sh; h < eh; h++) {
      const slotTime = `${String(h).padStart(2, '0')}:00`
      const hasCourt = availability.availableCourts.some((c) => c.time === slotTime)
      if (hasCourt) {
        logger.info(`[booking] pickBestSlotInRange: picked ${slotTime} (first slot with courts in ${startTime}–${endTime})`)
        return slotTime
      }
    }

    logger.info(`[booking] pickBestSlotInRange: no courts found in range ${startTime}–${endTime}, falling back to ${startTime}`)
  } catch (err) {
    logger.warn('[booking] pickBestSlotInRange cache read failed:', err instanceof Error ? err.message : err)
  }
  return startTime
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

  void logServerEvent(hostUserId, 'booking.started', { matchId, clubSlug: hostMembership.clubSlug })

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

    const tz = schedulingRequest?.timezone ?? 'UTC'
    const scheduled = new Date(match.scheduledAt)
    const date = scheduled.toLocaleDateString('en-CA', { timeZone: tz })
    const time = scheduled.toLocaleString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: tz })

    const otherParticipants = match.participants.filter((p) => p.userId !== hostUserId)
    logger.info(`[booking] Participants: total=${match.participants.length}, other=${otherParticipants.length}, ids=${otherParticipants.map(p => `${p.userId}(${p.user?.name})`).join(', ')}`)

    // Collect socio numbers + names for other participants
    const bookingParticipants: Array<{ socioNumber: string; name: string }> = []
    for (const participant of otherParticipants) {
      const participantName = participant.user?.name ?? participant.userId
      logger.info(`[booking] Looking up socio for participant ${participantName} (userId=${participant.userId}, phone=${participant.user?.phone ?? 'none'})`)

      // 1. Check ClubMembership (registered user with their own club account)
      const participantMembership = await prisma.clubMembership.findFirst({
        where: { userId: participant.userId, clubSlug: membership.clubSlug },
      })
      logger.info(`[booking] ClubMembership lookup: found=${!!participantMembership}, socioNumber=${participantMembership?.socioNumber ?? 'none'}`)
      if (participantMembership?.socioNumber) {
        bookingParticipants.push({ socioNumber: participantMembership.socioNumber, name: participantName })
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
          bookingParticipants.push({ socioNumber, name: participantName })
          continue
        }
      } else {
        logger.info(`[booking] Participant has no phone — skipping Contact lookup`)
      }

      const reason = `Missing socio number for participant ${participantName}`
      await failAttempt(attemptId, reason, 'MISSING_SOCIO_NUMBER')
      logBookingEvent(matchId, 'booking_failed', { errorMessage: reason }).catch(() => {})
      notifyBookingFailed(match, hostUserId, date, time, reason, schedulingRequest?.format)
      return
    }

    const adapter = getAdapter(membership.adapterType)
    const creds = {
      socioNumber: membership.socioNumber,
      password: decrypt(membership.encryptedPassword),
    }
    
    logger.info(`[booking] Booking job parameters: date=${date}, time=${time}, tz=${tz}, participants=${bookingParticipants.map((p) => `${p.name}(${p.socioNumber})`).join(', ')}`)

    const sport = schedulingRequest?.sportType ?? 'tennis'
    const sportOptions = { sport }
    const availCacheKey = `matchmaker:booking:availability:${membership.adapterType}:${membership.clubSlug}:${date}:${sport}`

    const MAX_RETRIES = 2
    const RETRY_DELAY_MS = 5000

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      if (attempt > 0) {
        logger.info(`[booking] Retry ${attempt}/${MAX_RETRIES} for match ${matchId} — waiting ${RETRY_DELAY_MS}ms`)
        await new Promise((r) => setTimeout(r, RETRY_DELAY_MS))
      }
      try {
        // Check availability — use cached full-day result to avoid redundant Puppeteer scrape.
        // On retries bypass the cache to get a fresh view of court availability.
        let availability: CourtAvailabilityResult | undefined
        if (attempt === 0) {
          try {
            const cached = await cacheGet(availCacheKey)
            if (cached) {
              logger.info(`[booking] Availability cache hit for booking job: ${availCacheKey}`)
              availability = JSON.parse(cached) as CourtAvailabilityResult
            }
          } catch (err) {
            logger.warn('[booking] Cache get failed in booking job:', err)
          }
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
          await failAttempt(attemptId, `No available courts at ${date} ${time}`, 'NO_AVAILABLE_COURTS')
          return
        }

        const result = await adapter.book(creds, date, time, court.courtId, bookingParticipants, sportOptions)

        // Conditionally update to success only if still pending (not cancelled mid-flight).
        const updated = await prisma.bookingAttempt.updateMany({
          where: { id: attemptId, status: 'pending' },
          data: {
            status: 'success',
            externalBookingId: result.externalId,
            courtName: result.courtName,
            completedAt: new Date(),
          },
        })

        // Match was cancelled while booking was in progress — cancel the just-made reservation.
        if (updated.count === 0) {
          logger.warn(`[booking] Match ${matchId} was cancelled during booking — cancelling reservation ${result.externalId}`)
          await adapter.cancel(creds, result.externalId).catch((err) => {
            logger.warn(`[booking] Failed to cancel mid-flight reservation for match ${matchId}:`, err instanceof Error ? err.message : err)
          })
          logBookingEvent(matchId, 'booking_cancelled', { reason: 'match_cancelled_mid_flight' }).catch(() => {})
          return
        }

        logBookingEvent(matchId, 'booking_success', { courtName: result.courtName, externalId: result.externalId }).catch(() => {})
        void logServerEvent(hostUserId, 'booking.success', { matchId, courtName: result.courtName, clubSlug: membership.clubSlug })
        logger.info(`[booking] Court booked for match ${matchId}: ${result.courtName} (${result.externalId})`)

        const opponentNames = match.participants
          .filter((p) => p.userId !== hostUserId)
          .map((p) => p.user?.name ?? '')
          .filter(Boolean)
          .join(', ')

        createNotification(hostUserId, 'booking.success', {
          matchId,
          courtName: result.courtName,
          ...(opponentNames && { opponentNames }),
        }).catch((err) => {
          logger.warn(`[booking] Failed to send booking.success notification for match ${matchId}:`, err instanceof Error ? err.message : err)
        })

        // Notify the WhatsApp group
        // Re-fetch whatsappGroupId here: the booking job starts before the scheduling service
        // saves the group ID to the match, so the initial match fetch may have had it as null.
        const freshGroupId = await prisma.match.findUnique({ where: { id: matchId }, select: { whatsappGroupId: true } })
          .then((m) => m?.whatsappGroupId ?? null)
          .catch(() => null)
        if (freshGroupId) {
          const hostLocale = await resolveGroupMessageLocale(hostUserId, match.participants.map((p) => p.userId), schedulingRequest?.format ?? 'singles')
          const message = getMessages(hostLocale).courtBooked(result.courtName, `${date} · ${time}`, match.availability?.locationText ?? '', result.confirmationUrl)
          whatsappService.sendGroupMessage(freshGroupId, message).catch((err) => {
            logger.warn(`[booking] Failed to send WhatsApp group notification for match ${matchId}:`, err)
          })
          logger.info(`[booking] WhatsApp court booked notification sent for match ${matchId}`)
        }
        return // success — exit retry loop
      } catch (err) {
        const offline = isOfflineError(err)
        const message = offline
          ? 'Club booking system is offline or unreachable'
          : (err instanceof Error ? err.message : String(err))
        const errorCode = offline
          ? 'ADAPTER_OFFLINE'
          : (err instanceof AppError ? err.errorCode : undefined)

        // BOOKING_PAGE_ERROR = error from the club portal (wrong participant, quota, etc.)
        // These are user-data problems — retrying won't help. Fail immediately.
        const isTerminal = err instanceof AppError && err.errorCode === 'BOOKING_PAGE_ERROR'

        if (!isTerminal && attempt < MAX_RETRIES) {
          logger.warn(`[booking] Attempt ${attempt + 1} failed for match ${matchId}, will retry: ${message}`)
        } else {
          await failAttempt(attemptId, message, errorCode)
          logBookingEvent(matchId, 'booking_failed', { errorMessage: message, attempts: attempt + 1 }).catch(() => {})
          void logServerEvent(hostUserId, 'booking.failed', { matchId, errorCode, clubSlug: membership.clubSlug })
          logger.error(`[booking] Booking failed for match ${matchId} after ${attempt + 1} attempt(s): ${message}`)
          // Only expose AppError messages (from the booking page itself) to users — raw Puppeteer errors are internal
          const userMessage = offline
            ? 'Club booking system is offline or unreachable'
            : (err instanceof AppError ? message : 'An error occurred during court booking')
          notifyBookingFailed(match, hostUserId, date, time, userMessage, schedulingRequest?.format)
          break
        }
      }
    }
  } catch (err) {
    // Setup phase errors (unexpected — membership/match lookup failures)
    const message = err instanceof Error ? err.message : String(err)
    await failAttempt(attemptId, message)
    logBookingEvent(matchId, 'booking_failed', { errorMessage: message }).catch(() => {})
    logger.error(`[booking] Unexpected setup error for match ${matchId}: ${message}`)
    // Reload match for group notification (match variable may not be in scope)
    const m = await prisma.match.findUnique({ where: { id: matchId }, include: { availability: true, participants: true } }).catch(() => null)
    if (m) {
      const sr = await prisma.schedulingRequest.findUnique({ where: { matchId } }).catch(() => null)
      const tz = sr?.timezone ?? 'UTC'
      const scheduled = new Date(m.scheduledAt)
      const d = scheduled.toLocaleDateString('en-CA', { timeZone: tz })
      const t = scheduled.toLocaleString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: tz })
      const hId = sr?.hostUserId ?? m.availability?.userId ?? ''
      notifyBookingFailed(m, hId, d, t, 'An unexpected error occurred during court booking', sr?.format)
    }
  }
}

function notifyBookingFailed(
  match: { id: string; whatsappGroupId: string | null; availability: { locationText?: string | null } | null; participants: { userId: string }[] },
  hostUserId: string,
  date: string,
  time: string,
  reason: string,
  format?: string,
): void {
  createNotification(hostUserId, 'booking.failed', { matchId: match.id, errorMessage: reason }).catch((err) => {
    logger.warn(`[booking] Failed to send booking.failed notification for match ${match.id}:`, err instanceof Error ? err.message : err)
  })

  // Re-fetch whatsappGroupId: the booking job may start before the scheduling service saves it
  prisma.match.findUnique({ where: { id: match.id }, select: { whatsappGroupId: true } })
    .then((m) => m?.whatsappGroupId ?? null)
    .catch(() => match.whatsappGroupId)
    .then((groupId) => {
      if (!groupId) return
      return resolveGroupMessageLocale(hostUserId, match.participants.map((p) => p.userId), format ?? 'singles')
        .then((locale) => {
          const when = `${date} · ${time}`
          const loc = match.availability?.locationText ?? ''
          const message = getMessages(locale).courtBookingFailed(when, loc, reason)
          return whatsappService.sendGroupMessage(groupId, message)
        })
    })
    .catch((err) => {
      logger.warn(`[booking] Failed to send booking failed WhatsApp for match ${match.id}:`, err instanceof Error ? err.message : err)
    })
}

async function failAttempt(attemptId: string, errorMessage: string, errorCode?: string): Promise<void> {
  await prisma.bookingAttempt.update({
    where: { id: attemptId },
    data: { status: 'failed', errorMessage, errorCode: errorCode ?? null, completedAt: new Date() },
  }).catch((e) => logger.error(`[booking] Failed to mark attempt ${attemptId} as failed:`, e))
}

/**
 * Retry a failed booking. Resets the existing attempt and re-runs the booking job.
 * Only allowed when the current attempt status is 'failed'.
 */
export async function retryBookingForMatch(matchId: string, membershipId?: string): Promise<void> {
  const match = await prisma.match.findUnique({ where: { id: matchId }, select: { status: true, scheduledAt: true } })
  if (!match) throw new AppError('Match not found', 404)
  if (match.status === 'cancelled') throw new AppError('Cannot retry booking for a cancelled match', 400)
  if (match.scheduledAt <= new Date()) throw new AppError('Cannot retry booking for a match in the past', 400)

  const existing = await prisma.bookingAttempt.findUnique({ where: { matchId } })

  if (!existing) {
    // No attempt yet — start a fresh booking (membershipId required)
    if (!membershipId) throw new AppError('membershipId is required to start a new booking attempt', 400)
    const attempt = await prisma.bookingAttempt.create({
      data: { matchId, clubMembershipId: membershipId, status: 'pending', attemptedAt: new Date() },
    })
    logBookingEvent(matchId, 'booking_pending', { fresh: true }).catch(() => {})
    runBookingJob(attempt.id, matchId, membershipId).catch((err) => {
      logger.error(`[booking] Unhandled error in booking job for match ${matchId}:`, err)
    })
    return
  }

  if (existing.status === 'success') {
    throw new AppError(`Cannot retry — booking already succeeded`, 409)
  }

  // If the attempt is stuck in 'pending' (job crashed / timed out without marking it failed),
  // cancel it first so any still-running job's updateMany becomes a safe no-op.
  if (existing.status === 'pending') {
    await prisma.bookingAttempt.update({
      where: { id: existing.id },
      data: { status: 'cancelled', completedAt: new Date() },
    })
    logger.info(`[booking] Force-cancelled stuck pending attempt ${existing.id} to allow retry`)
  }

  const effectiveMembershipId = membershipId ?? existing.clubMembershipId

  await prisma.bookingAttempt.update({
    where: { id: existing.id },
    data: {
      status: 'pending',
      errorMessage: null,
      errorCode: null,
      completedAt: null,
      attemptedAt: new Date(),
      clubMembershipId: effectiveMembershipId,
    },
  })

  logBookingEvent(matchId, 'booking_pending', { retry: true }).catch(() => {})

  runBookingJob(existing.id, matchId, effectiveMembershipId).catch((err) => {
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

  // If the booking job is still running, mark it cancelled so the job won't write success.
  if (attempt.status === 'pending') {
    await prisma.bookingAttempt.update({
      where: { id: attempt.id },
      data: { status: 'cancelled', completedAt: new Date() },
    })
    logBookingEvent(matchId, 'booking_cancelled').catch(() => {})
    logger.info(`[booking] Pending booking cancelled for match ${matchId}`)
    return
  }

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

  // Notify the WhatsApp group
  const match = await prisma.match.findUnique({
    where: { id: matchId },
    include: { availability: true, participants: true },
  }).catch(() => null)

  if (match?.whatsappGroupId && attempt.courtName) {
    const schedulingRequest = await prisma.schedulingRequest.findUnique({ where: { matchId } }).catch(() => null)
    const hostUserId = schedulingRequest?.hostUserId ?? match.availability?.userId
    const participantIds = match.participants.map((p) => p.userId)
    const hostLocale = hostUserId
      ? await resolveGroupMessageLocale(hostUserId, participantIds, schedulingRequest?.format ?? 'singles')
      : 'es'
    const tz = schedulingRequest?.timezone ?? 'UTC'
    const scheduled = new Date(match.scheduledAt)
    const date = scheduled.toLocaleDateString('en-CA', { timeZone: tz })
    const time = scheduled.toLocaleString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: tz })
    const message = getMessages(hostLocale).courtCancelled(attempt.courtName, `${date} · ${time}`, match.availability?.locationText ?? '')
    whatsappService.sendGroupMessage(match.whatsappGroupId, message).catch((err) => {
      logger.warn(`[booking] Failed to send WhatsApp cancellation notification for match ${matchId}:`, err)
    })
  }
}

/**
 * Cancel any existing court booking for a match and delete the BookingAttempt row,
 * then re-trigger a fresh booking attempt. Used when a match is rescheduled.
 * No-ops gracefully if there is no existing attempt or no active membership.
 */
export async function resetBookingForReschedule(matchId: string): Promise<void> {
  const attempt = await prisma.bookingAttempt.findUnique({ where: { matchId } })
  if (!attempt) {
    // No prior booking — just trigger fresh
    await triggerBookingForMatch(matchId)
    return
  }

  // Mark as cancelled first — signals any in-flight job not to write success
  await prisma.bookingAttempt.update({
    where: { id: attempt.id },
    data: { status: 'cancelled', completedAt: new Date() },
  }).catch((err) => {
    logger.warn(`[booking] Failed to mark attempt as cancelled on reschedule for match ${matchId}:`, err instanceof Error ? err.message : err)
  })

  // Cancel the existing court reservation at the club if it was confirmed
  if (attempt.status === 'success' && attempt.externalBookingId) {
    const membership = await prisma.clubMembership.findUnique({ where: { id: attempt.clubMembershipId } })
    if (membership?.encryptedPassword) {
      const adapter = getAdapter(membership.adapterType)
      const creds = { socioNumber: membership.socioNumber, password: decrypt(membership.encryptedPassword) }
      await adapter.cancel(creds, attempt.externalBookingId).catch((err) => {
        logger.warn(`[booking] Adapter cancel on reschedule failed for match ${matchId}:`, err instanceof Error ? err.message : err)
      })
    }
  }

  // Delete old attempt so triggerBookingForMatch can create a fresh one
  await prisma.bookingAttempt.delete({ where: { id: attempt.id } }).catch((err) => {
    logger.warn(`[booking] Failed to delete old booking attempt on reschedule for match ${matchId}:`, err instanceof Error ? err.message : err)
  })

  logBookingEvent(matchId, 'booking_pending', { reschedule: true }).catch(() => {})
  await triggerBookingForMatch(matchId)
}

/**
 * Finds all failed booking attempts for future matches where:
 * - The failure is retryable (not MISSING_SOCIO_NUMBER, which requires user action)
 * - The match is still in the future
 * - The host's club membership is still active
 * Resets each attempt to pending and re-runs the booking job.
 * Returns the number of attempts re-queued.
 */
export async function retryFailedBookingsForFutureMatches(): Promise<number> {
  const NON_RETRYABLE_ERRORS = ['MISSING_SOCIO_NUMBER', 'INVALID_CLUB_CREDENTIALS']
  const attempts = await prisma.bookingAttempt.findMany({
    where: {
      status: 'failed',
      errorCode: { notIn: NON_RETRYABLE_ERRORS },
      clubMembership: { status: 'active' },
      match: {
        scheduledAt: { gt: new Date() },
        status: { not: 'cancelled' },
        result: { is: null },
      },
    },
    select: { id: true, matchId: true, clubMembershipId: true },
  })

  let count = 0
  for (const attempt of attempts) {
    try {
      await prisma.bookingAttempt.update({
        where: { id: attempt.id },
        data: {
          status: 'pending',
          errorMessage: null,
          errorCode: null,
          completedAt: null,
          attemptedAt: new Date(),
        },
      })
      logBookingEvent(attempt.matchId, 'booking_pending', { retry: true, source: 'nightly_job' }).catch(() => {})
      runBookingJob(attempt.id, attempt.matchId, attempt.clubMembershipId).catch((err) => {
        logger.error(`[booking] Unhandled error in nightly retry job for match ${attempt.matchId}:`, err)
      })
      count++
    } catch (err) {
      logger.error(`[booking] Failed to re-queue attempt ${attempt.id} for match ${attempt.matchId}:`, err instanceof Error ? err.message : err)
    }
  }

  return count
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
  errorMessage: string | null; errorCode: string | null
  attemptedAt: Date; completedAt: Date | null
}): BookingAttemptDTO {
  return {
    id: a.id,
    matchId: a.matchId,
    clubMembershipId: a.clubMembershipId,
    status: a.status,
    externalBookingId: a.externalBookingId,
    courtName: a.courtName,
    errorMessage: a.errorMessage,
    errorCode: a.errorCode,
    attemptedAt: a.attemptedAt.toISOString(),
    completedAt: a.completedAt?.toISOString() ?? null,
  }
}
