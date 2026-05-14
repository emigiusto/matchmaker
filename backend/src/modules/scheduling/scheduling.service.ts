// scheduling.service.ts
// Core automation logic for sequential match scheduling via WhatsApp

import crypto from 'crypto';
import { prisma } from '../../prisma';
import { AppError } from '../../shared/errors/AppError';
import { logger } from '../../config/logger';
import { schedulingRepository } from './scheduling.repository';
import { whatsappService } from '../whatsapp/whatsapp.service';
import { createMatch, cancelMatch, notifyMatchParticipantsOnCreate } from '../matches/matches.service';
import { triggerBookingForMatch, pickBestSlotInRange, getCachedCourtsPerSlot } from '../booking/booking.service';
import { createNotification } from '../notifications/notifications.service';
import { logServerEvent } from '../analytics/analytics.service';
import type {
  CreateSchedulingRequestInput,
  SchedulingRequestDTO,
  SchedulingCandidateDTO,
  SchedulingInviteEventAction,
  SchedulingInviteEventDTO,
  PublicSchedulingInviteDTO,
  AdditionalDateEntry,
} from './scheduling.types';
import { normalizePhoneToCanonical } from '../../shared/utils/phone.utils';
import { findUserByNormalizedPhone, createGuestUser } from '../users/users.service';
import { MAX_ACTIVE_SCHEDULING_REQUESTS, MAX_CANDIDATES_SINGLES, MAX_CANDIDATES_DOUBLES } from './scheduling.types';
import { getMessages, resolveLocale } from '../../lib/whatsapp-messages';
import { resolveGroupMessageLocale } from '../../lib/locale-helpers';

const TIME_SLOT_RE = /^\d{2}:\d{2}$/;
const DATE_TIME_SLOT_RE = /^(\d{2})\/(\d{2}) · (\d{2}):00$/;
const NONE_OPTION_RE = /^(none|ninguno)$/i;

function parseAdditionalDates(raw: string | null | undefined): AdditionalDateEntry[] {
  if (!raw) return [];
  try { return JSON.parse(raw) as AdditionalDateEntry[]; } catch { return []; }
}

// Debounce poll quorum evaluation so rapid multi-select clicks are treated as one vote batch
const POLL_VOTE_DEBOUNCE_MS = 3000;
const pollDebounceTimers = new Map<string, ReturnType<typeof setTimeout>>();

/** Minimum accepted candidates required before marking request completed. Singles: 1. Doubles: 3 (host + 3 = 4 players). */
function getRequiredAcceptances(format: string): number {
  return format === 'doubles' ? 3 : 1;
}

function generateInviteToken(): string {
  return crypto.randomBytes(32).toString('base64url');
}

type RequestRow = {
  id: string;
  hostUserId: string;
  hostPartnerUserId: string | null;
  sportType: string;
  format: string;
  matchType: string;
  date: Date;
  startTime: Date;
  endTime: Date;
  locationText: string;
  radiusKm: number | null;
  inviteToken: string;
  status: string;
  currentCandidateIndex: number;
  matchId: string | null;
  additionalDates?: string | null;
  match?: { whatsappGroupId: string | null } | null;
  timezone?: string;
  createdAt: Date;
  updatedAt: Date;
  noCourtsAtQuorum?: boolean;
};

/** Format a Date in a given IANA timezone, e.g. "Europe/Madrid". Falls back to UTC on invalid tz. */
function formatInTz(date: Date, locale: string, options: Intl.DateTimeFormatOptions, timezone: string): string {
  try {
    return date.toLocaleString(locale, { ...options, timeZone: timezone });
  } catch {
    return date.toLocaleString(locale, { ...options, timeZone: 'UTC' });
  }
}

function toRequestDTO(r: RequestRow): SchedulingRequestDTO {
  return {
    id: r.id,
    hostUserId: r.hostUserId,
    hostPartnerUserId: r.hostPartnerUserId,
    sportType: r.sportType as SchedulingRequestDTO['sportType'],
    format: (r.format || 'singles') as SchedulingRequestDTO['format'],
    matchType: (r.matchType || 'competitive') as SchedulingRequestDTO['matchType'],
    date: r.date.toISOString(),
    startTime: r.startTime.toISOString(),
    endTime: r.endTime.toISOString(),
    locationText: r.locationText,
    radiusKm: r.radiusKm,
    inviteToken: r.inviteToken,
    status: r.status as SchedulingRequestDTO['status'],
    currentCandidateIndex: r.currentCandidateIndex,
    matchId: r.matchId,
    additionalDates: parseAdditionalDates(r.additionalDates),
    whatsappGroupId: r.match?.whatsappGroupId ?? null,
    timezone: r.timezone ?? 'UTC',
    noCourtsAtQuorum: r.noCourtsAtQuorum ?? false,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  };
}

function toRequestDTOWithCandidates(
  r: RequestRow & { candidates?: Array<{ id: string; schedulingRequestId: string; contactUserId: string; contactUser?: { name: string | null; phone: string | null } | null; priorityOrder: number; retryOrder?: number | null; status: string; contactedAt: Date | null; responseAt: Date | null; createdAt: Date; updatedAt: Date }> }
): SchedulingRequestDTO {
  const dto = toRequestDTO(r);
  if (r.candidates) {
    dto.candidates = r.candidates.map((c) => ({
      ...toCandidateDTO(c),
      contactUserName: c.contactUser?.name ?? null,
      contactPhone: c.contactUser?.phone ?? null,
    }));
  }
  return dto;
}

function toCandidateDTO(c: { id: string; schedulingRequestId: string; contactUserId: string; priorityOrder: number; retryOrder?: number | null; status: string; contactedAt: Date | null; responseAt: Date | null; createdAt: Date; updatedAt: Date }): SchedulingCandidateDTO {
  return {
    id: c.id,
    schedulingRequestId: c.schedulingRequestId,
    contactUserId: c.contactUserId,
    priorityOrder: c.priorityOrder,
    retryOrder: c.retryOrder ?? null,
    status: c.status as SchedulingCandidateDTO['status'],
    contactedAt: c.contactedAt?.toISOString() ?? null,
    responseAt: c.responseAt?.toISOString() ?? null,
    createdAt: c.createdAt.toISOString(),
    updatedAt: c.updatedAt.toISOString(),
  };
}

/** Returns each whole-hour slot in [startHHMM, endHHMM), e.g. ['10:00', '11:00'] for 10:00–12:00 */
function slotsInRange(startHHMM: string, endHHMM: string): string[] {
  const [sh] = startHHMM.split(':').map(Number);
  const [eh] = endHHMM.split(':').map(Number);
  const slots: string[] = [];
  for (let h = sh; h < eh; h++) {
    slots.push(`${String(h).padStart(2, '0')}:00`);
  }
  return slots;
}

function isMultiHour(startTime: Date, endTime: Date): boolean {
  return endTime.getTime() - startTime.getTime() > 60 * 60 * 1000;
}

/** Poll buttons: one per available time slot, plus a "None" option to decline. */
function getInviteButtons(locale: string | null | undefined, slots: string[]): { id: string; title: string }[] {
  const loc = resolveLocale(locale);
  const noneLabel = loc === 'es' ? 'Ninguno' : loc === 'ca' ? 'Cap' : 'None';
  return [
    ...slots.map((slot, i) => ({ id: `slot_${i}`, title: slot })),
    { id: 'invite_none', title: noneLabel },
  ];
}

const FRONTEND_BASE = process.env.FRONTEND_BASE_URL || 'https://matchmaker-flame.vercel.app';

function formatGroupInviteMessage(input: {
  sportType: string;
  format: string;
  whenStr: string;
  location: string;
  rivalOrPlayersStr?: string;
  matchUrl?: string;
  locale?: string | null;
}): string {
  const sportEmoji = input.sportType === 'padel' ? '🏓' : '🎾';
  const sport = input.sportType.charAt(0).toUpperCase() + input.sportType.slice(1).toLowerCase();
  const formatLabel = input.format === 'doubles' ? 'Doubles' : 'Singles';
  const loc = (input.location && input.location.trim()) || 'TBD';
  const matchUrl = input.matchUrl ?? null;
  const resolvedLoc = resolveLocale(input.locale);
  const confirmedLine = resolvedLoc === 'ca' ? '🎉 El teu partit està confirmat!' : resolvedLoc === 'es' ? '¡Tu partido está confirmado!' : 'Your match is confirmed!';
  const viewMatchLabel = resolvedLoc === 'ca' ? 'Veure el partit' : resolvedLoc === 'es' ? 'Ver partido' : 'View match';
  const joinGroupLine = resolvedLoc === 'ca' ? "Uneix-te al grup de WhatsApp del partit:" : resolvedLoc === 'es' ? 'Únete al grupo de WhatsApp del partido:' : 'Join the match WhatsApp group:';
  return [
    `${sportEmoji} *${confirmedLine}*`,
    '',
    `📅  ${input.whenStr}`,
    `📍  ${loc}`,
    `🏅  ${sport} ${formatLabel}`,
    ...(input.rivalOrPlayersStr ? [`👥  ${input.rivalOrPlayersStr}`] : []),
    '',
    ...(matchUrl ? [`🔗 *${viewMatchLabel}:* ${matchUrl}`, ''] : []),
    joinGroupLine,
  ].join('\n');
}

function formatMatchDetailsMessage(
  sportType: string,
  format: string,
  whenStr: string,
  location: string,
  matchUrl: string,
  locale?: string | null
): string {
  const sport = sportType.charAt(0).toUpperCase() + sportType.slice(1).toLowerCase();
  const formatLabel = format === 'doubles' ? 'Doubles' : 'Singles';
  return getMessages(locale).matchConfirmed(sport, formatLabel, whenStr, location, matchUrl);
}


/** Reason codes when a scheduling request expires (No match) */
type SchedulingExpiredReason = 'no_more_candidates' | 'all_candidates_exhausted' | 'scheduled_time_passed';

function formatNoMatchWhatsAppMessage(
  sportType: string,
  format: string,
  dateStr: string,
  timeStr: string,
  location: string,
  reason: SchedulingExpiredReason,
  requestId: string,
  locale?: string | null
): string {
  const msgs = getMessages(locale);
  const sport = sportType.charAt(0).toUpperCase() + sportType.slice(1).toLowerCase();
  const formatLabel = format === 'doubles' ? 'Doubles' : 'Singles';
  const whenStr = `${dateStr} · ${timeStr}`;
  const reasonText = msgs.noMatchReason[reason];
  const requestUrl = `${FRONTEND_BASE.replace(/\/$/, '')}/#/play/${requestId}`;
  return msgs.noMatch(sport, formatLabel, whenStr, location, reasonText, requestUrl);
}

async function recordEvent(data: {
  schedulingRequestId: string;
  action: SchedulingInviteEventAction;
  candidateId?: string | null;
  actorUserId?: string | null;
  metadata?: Record<string, unknown> | null;
}): Promise<void> {
  try {
    await prisma.schedulingInviteEvent.create({
      data: {
        schedulingRequestId: data.schedulingRequestId,
        action: data.action,
        candidateId: data.candidateId ?? null,
        actorUserId: data.actorUserId ?? null,
        metadata: data.metadata ? (data.metadata as object) : undefined,
      },
    });
  } catch (e) {
    logger.warn('FailedToRecordSchedulingEvent', { action: data.action, requestId: data.schedulingRequestId, error: e });
  }
}

async function sendInviteNoLongerAvailable(
  request: {
    date: Date;
    sportType: string;
    timezone?: string;
    hostUser?: { name: string | null } | null;
  },
  candidate: {
    id: string;
    contactUser?: { phone?: string | null; locale?: string | null } | null;
  }
): Promise<void> {
  const phone = candidate.contactUser?.phone;
  if (!phone) return;

  const candidateLocale = candidate.contactUser?.locale ?? 'es';
  const loc = resolveLocale(candidateLocale);
  const intlLocale = loc === 'es' ? 'es-ES' : loc === 'ca' ? 'ca-ES' : 'en-US';
  const tz = request.timezone ?? 'UTC';
  const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
  const sep = loc === 'en' ? ' ' : ' de ';
  const dateStr = `${cap(formatInTz(request.date, intlLocale, { weekday: 'long' }, tz))}, ${formatInTz(request.date, intlLocale, { day: 'numeric' }, tz)}${sep}${cap(formatInTz(request.date, intlLocale, { month: 'long' }, tz))}`;

  const hostName = request.hostUser?.name ?? (loc === 'ca' ? "L'organitzador" : loc === 'en' ? 'The organizer' : 'El organizador');
  const msgs = getMessages(candidateLocale);
  const message = msgs.inviteNoLongerAvailable(hostName, request.sportType, dateStr);

  const result = await whatsappService.sendInviteMessage(phone, message);
  if (!result.success) {
    logger.warn('FailedToSendInviteNoLongerAvailable', { candidateId: candidate.id, phone, error: result.error });
  }
}

async function notifyNoCourtsAtQuorum(requestId: string): Promise<void> {
  void recordEvent({ schedulingRequestId: requestId, action: 'no_courts_at_quorum' });
  const candidates = await prisma.schedulingCandidate.findMany({
    where: { schedulingRequestId: requestId, status: { in: ['responded', 'contacted', 'waiting_reply'] } },
    include: { contactUser: { select: { phone: true, locale: true } } },
  });
  await Promise.all(
    candidates.map(async (c) => {
      const phone = c.contactUser?.phone;
      if (!phone) return;
      const msgs = getMessages(c.contactUser?.locale);
      const result = await whatsappService.sendInviteMessage(phone, msgs.noCourtsAtQuorum());
      if (!result.success) {
        logger.warn('FailedToSendNoCourtsAtQuorum', { candidateId: c.id, phone, error: result.error });
      }
    })
  );
}

async function notifyHostSchedulingNoMatch(
  request: {
    id: string;
    hostUserId: string;
    sportType: string;
    format: string;
    date: Date;
    startTime: Date;
    endTime: Date;
    locationText: string;
    hostUser?: { id: string; name: string | null; phone: string | null; locale?: string | null } | null;
  },
  reason: SchedulingExpiredReason
): Promise<void> {
  const hostLocale = (request.hostUser as { locale?: string | null } | null | undefined)?.locale ?? 'es';
  const tz = (request as RequestRow).timezone ?? 'UTC';
  const _hostLoc = resolveLocale(hostLocale);
  const intlLocale = _hostLoc === 'es' ? 'es-ES' : _hostLoc === 'ca' ? 'ca-ES' : 'en-US';
  const dateStr = formatInTz(request.date, intlLocale, { weekday: 'short', month: 'short', day: 'numeric' }, tz);
  const timeStr = `${formatInTz(request.startTime, intlLocale, { hour: '2-digit', minute: '2-digit' }, tz)} - ${formatInTz(request.endTime, intlLocale, { hour: '2-digit', minute: '2-digit' }, tz)}`;
  const payload = {
    requestId: request.id,
    reason,
    sportType: request.sportType,
    format: request.format,
    date: request.date.toISOString(),
    time: timeStr,
    location: request.locationText,
  };

  try {
    await createNotification(request.hostUserId, 'scheduling.no_match', payload);
    logger.info('NotificationCreated', { type: 'scheduling.no_match', requestId: request.id, hostUserId: request.hostUserId });
  } catch (e) {
    logger.warn('FailedToCreateNoMatchNotification', { requestId: request.id, error: e });
  }

  const hostPhone = request.hostUser?.phone;
  if (hostPhone) {
    const msg = formatNoMatchWhatsAppMessage(
      request.sportType,
      request.format,
      dateStr,
      timeStr,
      request.locationText,
      reason,
      request.id,
      hostLocale
    );
    const result = await whatsappService.sendInviteMessage(hostPhone, msg);
    if (result.success) {
      //logger.info('NoMatchWhatsAppSent', { requestId: request.id, hostUserId: request.hostUserId });
    } else {
      logger.warn('FailedToSendNoMatchWhatsApp', { requestId: request.id, error: result.error });
    }
  }
}

export const schedulingService = {
  async createSchedulingRequest(input: CreateSchedulingRequestInput): Promise<SchedulingRequestDTO> {
    if (!input.candidateUserIds?.length) {
      throw new AppError('At least one candidate is required', 400);
    }

    const activeCount = await schedulingRepository.countActiveByHostUserId(input.hostUserId);
    if (activeCount >= MAX_ACTIVE_SCHEDULING_REQUESTS) {
      throw new AppError(`Maximum ${MAX_ACTIVE_SCHEDULING_REQUESTS} active scheduling requests allowed`, 400);
    }

    const hostUser = await prisma.user.findUnique({ where: { id: input.hostUserId } });
    if (!hostUser) throw new AppError('Host user not found', 404);

    let format = input.format ?? 'singles';
    if (input.sportType === 'padel') format = 'doubles';
    const invalidCandidate = (input.candidateUserIds ?? []).find((id) => id === input.hostUserId);
    if (invalidCandidate) {
      throw new AppError('You cannot invite yourself as a candidate', 400);
    }

    const minCandidates = format === 'doubles' ? 3 : 1;
    const candidateIds = input.candidateUserIds ?? [];
    if (candidateIds.length < minCandidates) {
      throw new AppError(
        format === 'doubles'
          ? `Doubles matches require at least 3 candidates (you provided ${candidateIds.length})`
          : `Add at least 1 contact`,
        400
      );
    }

    // Enforce candidate limits: 5 for singles, 8 for doubles
    const maxCandidates = format === 'doubles' ? MAX_CANDIDATES_DOUBLES : MAX_CANDIDATES_SINGLES;
    if (candidateIds.length > maxCandidates) {
      throw new AppError(`Too many candidates. Maximum is ${maxCandidates} for ${format}.`, 400);
    }

    const matchType = input.matchType ?? 'competitive';
    const date = new Date(input.date);
    const startTime = new Date(input.startTime);
    const endTime = new Date(input.endTime);
    const inviteToken = generateInviteToken();

    const request = await prisma.$transaction(async (tx) => {
      const req = await tx.schedulingRequest.create({
        data: {
          hostUserId: input.hostUserId,
          hostPartnerUserId: format === 'doubles' ? input.hostPartnerUserId : null,
          sportType: input.sportType,
          format,
          matchType,
          date,
          startTime,
          endTime,
          locationText: (input.locationText ?? "").trim(),
          radiusKm: input.radiusKm ?? null,
          bookingEnabled: input.bookingEnabled ?? false,
          timezone: input.timezone ?? 'UTC',
          additionalDates: input.additionalDates && input.additionalDates.length > 0
            ? JSON.stringify(input.additionalDates)
            : null,
          inviteToken,
          status: 'active',
        },
      });
      await Promise.all(
        input.candidateUserIds.map((contactUserId, index) =>
          tx.schedulingCandidate.create({
            data: {
              schedulingRequestId: req.id,
              contactUserId,
              priorityOrder: index,
              status: 'pending',
            },
          })
        )
      );
      return req;
    });

    logger.info('SchedulingRequest created', { requestId: request.id, hostUserId: input.hostUserId, format });
    void logServerEvent(input.hostUserId, 'scheduling.request_created', { requestId: request.id, sportType: input.sportType, format });
    const full = await schedulingRepository.findRequestById(request.id);
    return full ? toRequestDTOWithCandidates(full) : toRequestDTO(request);
  },

  async startScheduling(requestId: string): Promise<SchedulingRequestDTO | null> {
    const request = await schedulingRepository.findActiveRequestById(requestId);
    if (!request) return null;

    const activeCount = await schedulingRepository.countActiveByHostUserId(request.hostUserId);
    if (activeCount > MAX_ACTIVE_SCHEDULING_REQUESTS) {
      throw new AppError(`Maximum ${MAX_ACTIVE_SCHEDULING_REQUESTS} active scheduling requests allowed`, 400);
    }

    void recordEvent({ schedulingRequestId: requestId, action: 'request_started', actorUserId: request.hostUserId });

    const pending = await schedulingRepository.findFirstPendingCandidate(requestId);
    if (!pending) {
      await schedulingRepository.updateRequestStatus(requestId, 'expired');
      logger.info('SchedulingExpired', { requestId, reason: 'no_more_candidates' });
      void recordEvent({ schedulingRequestId: requestId, action: 'request_expired', metadata: { reason: 'no_more_candidates' } });
      await notifyHostSchedulingNoMatch(request, 'no_more_candidates');
      return toRequestDTOWithCandidates({ ...request, status: 'expired' });
    }

    await this.contactNextCandidates(requestId);
    const updated = await schedulingRepository.findRequestById(requestId);
    return updated ? toRequestDTOWithCandidates(updated) : null;
  },

  async contactNextCandidates(requestId: string): Promise<void> {
    const request = await schedulingRepository.findActiveRequestById(requestId);
    if (!request) return;

    // Contact ALL pending candidates at once — no sequential queue
    const toContact = await schedulingRepository.findPendingCandidatesOrdered(requestId, 100);
    if (toContact.length === 0) {
      const pendingCount = await schedulingRepository.countPendingCandidates(requestId);
      const activeCount = await schedulingRepository.countActiveCandidates(requestId);
      if (pendingCount === 0 && activeCount === 0) {
        await schedulingRepository.updateRequestStatus(requestId, 'expired');
        logger.info('SchedulingExpired', { requestId, reason: 'all_candidates_exhausted' });
        void recordEvent({ schedulingRequestId: requestId, action: 'request_expired', metadata: { reason: 'all_candidates_exhausted' } });
        await notifyHostSchedulingNoMatch(request, 'all_candidates_exhausted');
      }
      return;
    }

    const hostName = request.hostUser?.name || request.hostUser?.email || 'Un jugador';
    const tz = (request as RequestRow).timezone ?? 'UTC';
    const format = (request as RequestRow).format || 'singles';

    for (const candidate of toContact) {
      const phone = candidate.contactUser?.phone;
      const contactName = candidate.contactUser?.name ?? candidate.contactUser?.email ?? candidate.contactUserId;
      if (!phone) {
        logger.warn('InviteSkipped', { candidateId: candidate.id, contactName, reason: 'no_phone' });
        await schedulingRepository.updateCandidateStatus(candidate.id, 'send_failed');
        void recordEvent({ schedulingRequestId: requestId, action: 'invite_sent', candidateId: candidate.id, metadata: { failed: true, reason: 'no_phone' } });
        continue;
      }

      const ownerContact = await prisma.contact.findFirst({
        where: { ownerUserId: request.hostUserId, linkedUserId: candidate.contactUserId },
        select: { communicationLanguage: true },
      });
      const candidateLocale = ownerContact?.communicationLanguage
        ?? (candidate.contactUser as { locale?: string | null } | null | undefined)?.locale
        ?? 'es';
      const loc = resolveLocale(candidateLocale);
      const intlLocale = loc === 'es' ? 'es-ES' : loc === 'ca' ? 'ca-ES' : 'en-US';
      const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
      const sep = loc === 'en' ? ' ' : ' de ';
      const dateStr = `${cap(formatInTz(request.date, intlLocale, { weekday: 'long' }, tz))}, ${formatInTz(request.date, intlLocale, { day: 'numeric' }, tz)}${sep}${cap(formatInTz(request.date, intlLocale, { month: 'long' }, tz))}`;
      const timeStr = `${formatInTz(request.startTime, intlLocale, { hour: '2-digit', minute: '2-digit' }, tz)} · ${formatInTz(request.endTime, intlLocale, { hour: '2-digit', minute: '2-digit' }, tz)}`;
      const msgs = getMessages(candidateLocale);
      const formatLabel = format === 'doubles' ? 'Doubles' : 'Singles';

      const startHHMM = formatInTz(request.startTime, 'en-US', { hour: '2-digit', minute: '2-digit', hour12: false }, tz);
      const endHHMM = formatInTz(request.endTime, 'en-US', { hour: '2-digit', minute: '2-digit', hour12: false }, tz);
      const slots = slotsInRange(startHHMM, endHHMM);

      const additionalDates = parseAdditionalDates((request as RequestRow).additionalDates);
      const isMultiDate = additionalDates.length > 0;

      let message: string;
      let inviteButtons: { id: string; title: string }[];

      if (isMultiDate) {
        message = msgs.inviteMultiDatePoll(hostName, request.sportType, format, request.locationText);
        const noneLabel = loc === 'es' ? 'Ninguno' : loc === 'ca' ? 'Cap' : 'None';
        const multiButtons: { id: string; title: string }[] = [];

        // Primary date uses request.startTime / endTime
        const primaryD = request.date;
        const primaryDd = String(primaryD.getUTCDate()).padStart(2, '0');
        const primaryMm = String(primaryD.getUTCMonth() + 1).padStart(2, '0');
        for (const slot of slots) {
          multiButtons.push({ id: `slot_${primaryDd}${primaryMm}_${slot.replace(':', '')}`, title: `${primaryDd}/${primaryMm} · ${slot}` });
        }

        // Additional dates use their own startTime / endTime
        for (const entry of additionalDates) {
          const dObj = new Date(entry.date);
          const dd = String(dObj.getUTCDate()).padStart(2, '0');
          const mm = String(dObj.getUTCMonth() + 1).padStart(2, '0');
          const addSlots = slotsInRange(entry.startTime, entry.endTime);
          for (const slot of addSlots) {
            multiButtons.push({ id: `slot_${dd}${mm}_${slot.replace(':', '')}`, title: `${dd}/${mm} · ${slot}` });
          }
        }

        multiButtons.push({ id: 'invite_none', title: noneLabel });
        inviteButtons = multiButtons;
      } else {
        message = msgs.invitePoll(hostName, request.sportType, format, dateStr, request.locationText);
        // Annotate unavailable slots inline in the message body (only when booking is enabled and at least one slot has no courts)
        if ((request as RequestRow & { bookingEnabled?: boolean }).bookingEnabled && slots.length > 0) {
          const dateStrISO = new Date(request.date).toISOString().slice(0, 10);
          const hostMembership = await prisma.clubMembership.findFirst({
            where: { userId: request.hostUserId, status: 'active', encryptedPassword: { not: null } },
          });
          if (hostMembership) {
            const courtsPerSlot = await getCachedCourtsPerSlot(
              request.hostUserId, hostMembership.clubSlug, dateStrISO, request.sportType, slots,
            );
            if (courtsPerSlot) {
              const hasUnavailable = slots.some(slot => (courtsPerSlot[slot] ?? 1) === 0);
              if (hasUnavailable) {
                const noCourtsLabel = loc === 'es' ? 'No hay pistas disponibles' : loc === 'ca' ? 'No hi ha pistes disponibles' : 'No courts available';
                const slotLines = slots.map(slot =>
                  (courtsPerSlot[slot] ?? 1) === 0 ? `${slot} - ${noCourtsLabel}` : slot,
                );
                message = `${message}\n\n${slotLines.join('\n')}`;
              }
            }
          }
        }
        inviteButtons = getInviteButtons(candidateLocale, slots);
      }

      // For doubles always append who else is invited
      if (format === 'doubles' && request.candidates) {
        const otherNames = (request.candidates as Array<{ contactUserId: string; contactUser?: { name?: string | null } | null }>)
          .filter((c) => c.contactUserId !== candidate.contactUserId)
          .slice(0, 4)
          .map((c) => {
            const firstName = (c.contactUser?.name ?? '').split(' ')[0].slice(0, 12);
            return firstName;
          })
          .filter(Boolean);
        if (otherNames.length > 0) {
          const namesLine = loc === 'es'
            ? `👥 Posibles compañeros: ${otherNames.join(', ')}`
            : loc === 'ca'
            ? `👥 Possibles companys: ${otherNames.join(', ')}`
            : `👥 Possible partners: ${otherNames.join(', ')}`;
          message = `${message}\n\n${namesLine}`;
        }
      }

      await prisma.$transaction(async (tx) => {
        await tx.schedulingCandidate.update({
          where: { id: candidate.id },
          data: { status: 'contacted', contactedAt: new Date() },
        });
        await tx.schedulingRequest.update({
          where: { id: requestId },
          data: { currentCandidateIndex: candidate.priorityOrder },
        });
      });

      const result = await whatsappService.sendInviteMessage(phone, message, {
        buttons: [...inviteButtons],
      });
      await schedulingRepository.updateCandidateStatus(candidate.id, 'waiting_reply');

      if (!result.success) {
        logger.error('InviteSendFailed', { candidateId: candidate.id, contactName, error: result.error });
        await schedulingRepository.updateCandidateStatus(candidate.id, 'send_failed');
        void recordEvent({ schedulingRequestId: requestId, action: 'invite_sent', candidateId: candidate.id, metadata: { failed: true, reason: result.error } });
      } else {
        logger.info('InviteSent', { requestId, candidateId: candidate.id, contactUserId: candidate.contactUserId, contactName, phone });
        void recordEvent({ schedulingRequestId: requestId, action: 'invite_sent', candidateId: candidate.id });
        if (result.messageId) {
          await prisma.schedulingCandidate.update({
            where: { id: candidate.id },
            data: { pollMessageId: result.messageId },
          });
        }
      }
    }
    await this.contactNextCandidates(requestId);
  },

  async handleCandidateResponse(senderPhoneNumber: string, messageText: string, votedOptions?: string[]): Promise<{ processed: boolean }> {
    const candidate = await schedulingRepository.findCandidateToRecordResponseByPhone(senderPhoneNumber);
    if (!candidate) {
      return { processed: false };
    }

    const request = candidate.schedulingRequest;

    // All invites use poll format. Route every response through handlePollVote.
    // votedOptions is set for Wasender poll votes; for Whapi button clicks the
    // button title arrives as plain messageText — treat it as a single-element array.
    return this.handlePollVote(candidate, request as RequestRow, votedOptions ?? [messageText.trim()]);
  },

  async handlePollVote(
    candidate: { id: string; status: string; contactUserId: string },
    request: RequestRow & { status: string },
    options: string[],
  ): Promise<{ processed: boolean }> {
    if (request.status !== 'active') {
      logger.warn('PollVoteIgnored', { reason: 'request_not_active', requestId: request.id });
      return { processed: true };
    }
    if (candidate.status === 'expired') {
      logger.info('PollVoteIgnored', { reason: 'candidate_expired', candidateId: candidate.id });
      return { processed: true };
    }

    const trimmedOptions = options.map((o) => o.trim());

    // Check for multi-date votes (DD/MM · HH:00 format)
    const multiDateOptions = trimmedOptions.filter((o) => DATE_TIME_SLOT_RE.test(o));
    if (multiDateOptions.length > 0) {
      const additionalDates = parseAdditionalDates(request.additionalDates);
      const allDateStrs = [request.date.toISOString().slice(0, 10), ...additionalDates.map(e => e.date)];
      const parsedDateTimes: string[] = [];
      for (const option of multiDateOptions) {
        const m = DATE_TIME_SLOT_RE.exec(option);
        if (!m) continue;
        const [, dd, mm, hh] = m;
        const matchedDate = allDateStrs.find(d => {
          const dObj = new Date(d);
          return String(dObj.getUTCDate()).padStart(2, '0') === dd &&
                 String(dObj.getUTCMonth() + 1).padStart(2, '0') === mm;
        });
        if (matchedDate) parsedDateTimes.push(`${matchedDate}·${hh}`);
      }
      if (parsedDateTimes.length === 0) {
        logger.info('PollVoteIgnored', { reason: 'unrecognized_multidate_response', options, candidateId: candidate.id });
        return { processed: false };
      }
      await recordEvent({
        schedulingRequestId: request.id,
        action: 'poll_vote',
        candidateId: candidate.id,
        metadata: { dateTimes: parsedDateTimes },
      });
      logger.info('MultiDatePollVoteRecorded', { requestId: request.id, candidateId: candidate.id, dateTimes: parsedDateTimes });
      await prisma.schedulingCandidate.updateMany({
        where: { id: candidate.id, status: { in: ['waiting_reply', 'contacted'] } },
        data: { status: 'responded', responseAt: new Date() },
      });
      const existing = pollDebounceTimers.get(request.id);
      if (existing) clearTimeout(existing);
      pollDebounceTimers.set(
        request.id,
        setTimeout(() => {
          pollDebounceTimers.delete(request.id);
          void this.checkPollQuorum(request.id);
        }, POLL_VOTE_DEBOUNCE_MS),
      );
      return { processed: true };
    }

    // Parse HH:MM slots from the voted option titles (single-date poll)
    const votedHours = trimmedOptions
      .filter((o) => TIME_SLOT_RE.test(o))
      .map((o) => o.slice(0, 2)); // normalize to 'HH'

    if (votedHours.length === 0) {
      // If the user explicitly selected the "None" option, treat it as a decline.
      // Any other unrecognized text (e.g. a plain chat message) is silently ignored.
      const isExplicitDecline = trimmedOptions.some((o) => NONE_OPTION_RE.test(o));
      if (!isExplicitDecline) {
        logger.info('PollVoteIgnored', { reason: 'unrecognized_response', options, candidateId: candidate.id });
        return { processed: false };
      }
      const now = new Date();
      const declineResult = await prisma.schedulingCandidate.updateMany({
        where: { id: candidate.id, status: { in: ['waiting_reply', 'contacted'] } },
        data: { status: 'declined', responseAt: now },
      });
      if (declineResult.count === 0) {
        logger.warn('PollDeclineDuplicate', { candidateId: candidate.id });
        return { processed: true };
      }
      logger.info('PollDeclined', { requestId: request.id, candidateId: candidate.id });
      void recordEvent({ schedulingRequestId: request.id, action: 'invite_declined', candidateId: candidate.id });
      if (request.status === 'active') {
        await this.contactNextCandidates(request.id);
      }
      return { processed: true };
    }

    // Record poll vote (overwrites previous; we replay events to get current state)
    await recordEvent({
      schedulingRequestId: request.id,
      action: 'poll_vote',
      candidateId: candidate.id,
      metadata: { hours: votedHours },
    });

    logger.info('PollVoteRecorded', { requestId: request.id, candidateId: candidate.id, hours: votedHours });
    await prisma.schedulingCandidate.updateMany({
      where: { id: candidate.id, status: { in: ['waiting_reply', 'contacted'] } },
      data: { status: 'responded', responseAt: new Date() },
    });

    // Debounce quorum evaluation — Wasender fires one poll.results webhook per click,
    // each containing the FULL current poll state. We reset the timer on every vote so
    // quorum is only evaluated once the user stops clicking (3 s of silence).
    const existing = pollDebounceTimers.get(request.id);
    if (existing) clearTimeout(existing);
    pollDebounceTimers.set(
      request.id,
      setTimeout(() => {
        pollDebounceTimers.delete(request.id);
        void this.checkPollQuorum(request.id);
      }, POLL_VOTE_DEBOUNCE_MS),
    );

    return { processed: true };
  },

  async checkPollQuorum(requestId: string): Promise<void> {
    const request = await prisma.schedulingRequest.findUnique({
      where: { id: requestId },
      include: { hostUser: true },
    });
    if (!request || request.status !== 'active') return;

    const format = (request as RequestRow).format || 'singles';
    const required = getRequiredAcceptances(format);

    const allVoteEvents = await prisma.schedulingInviteEvent.findMany({
      where: { schedulingRequestId: requestId, action: 'poll_vote' },
      orderBy: { createdAt: 'asc' },
    });

    // Latest vote per candidate (replay events — last write wins)
    const latestVotes = new Map<string, string[]>();
    for (const ev of allVoteEvents) {
      if (ev.candidateId) {
        latestVotes.set(ev.candidateId, (ev.metadata as { hours?: string[] } | null)?.hours ?? []);
      }
    }

    // Multi-date quorum path: votes stored as { dateTimes: ["YYYY-MM-DD·HH", ...] }
    const additionalDates = parseAdditionalDates((request as RequestRow).additionalDates ?? null);
    const isMultiDate = additionalDates.length > 0;

    if (isMultiDate) {
      const latestDateTimeVotes = new Map<string, string[]>();
      for (const ev of allVoteEvents) {
        if (ev.candidateId) {
          const dateTimes = (ev.metadata as { dateTimes?: string[] } | null)?.dateTimes ?? [];
          if (dateTimes.length > 0) latestDateTimeVotes.set(ev.candidateId, dateTimes);
        }
      }
      if (latestDateTimeVotes.size < required) return;

      const dateTimeCounts = new Map<string, number>();
      for (const dateTimes of latestDateTimeVotes.values()) {
        for (const dt of dateTimes) {
          dateTimeCounts.set(dt, (dateTimeCounts.get(dt) ?? 0) + 1);
        }
      }
      // All date-times that reached quorum, sorted earliest first
      const confirmedDateTimes = [...dateTimeCounts.entries()]
        .filter(([, count]) => count >= required)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([dt]) => dt);
      if (confirmedDateTimes.length === 0) return;

      // Default: pick earliest with quorum
      let confirmedDateTime = confirmedDateTimes[0];

      // When booking is enabled, only confirm if a court is available for one of the confirmed slots
      if ((request as RequestRow & { bookingEnabled?: boolean }).bookingEnabled) {
        const hostUser = request.hostUser;
        if (hostUser) {
          const hostMembership = await prisma.clubMembership.findFirst({
            where: { userId: hostUser.id, status: 'active', encryptedPassword: { not: null } },
          });
          if (hostMembership) {
            let found: string | null = null;
            for (const dt of confirmedDateTimes) {
              const [dateStr, hh] = dt.split('·');
              const slotHHMM = `${hh.padStart(2, '0')}:00`;
              const nextH = String(Number(hh) + 1).padStart(2, '0');
              const picked = await pickBestSlotInRange(
                hostUser.id, hostMembership.clubSlug, dateStr, request.sportType, slotHHMM, `${nextH}:00`,
              );
              if (picked === slotHHMM) { found = dt; break; }
            }
            if (!found) {
              await notifyNoCourtsAtQuorum(requestId);
              return;
            }
            confirmedDateTime = found;
          }
        }
      }

      const [dateStr, hh] = confirmedDateTime.split('·');
      // hh is in local time (as shown in the poll) — convert to UTC before passing to completeScheduling.
      // Use noon UTC on the confirmed date as reference to safely compute DST-aware offset.
      const tz = (request as RequestRow).timezone ?? 'UTC';
      const noonUtc = new Date(`${dateStr}T12:00:00.000Z`);
      const localNoonH = Number(formatInTz(noonUtc, 'en-US', { hour: '2-digit', hour12: false }, tz));
      const tzOffsetH = localNoonH - 12;
      const utcH = ((Number(hh) - tzOffsetH) + 24) % 24;
      const overrideSlotUTC = `${String(utcH).padStart(2, '0')}:00`;
      const acceptingCandidateIds = [...latestDateTimeVotes.entries()]
        .filter(([, dts]) => dts.includes(confirmedDateTime))
        .map(([id]) => id)
        .slice(0, required);

      await prisma.$transaction(async (tx) => {
        // Include 'expired' so candidates whose window elapsed before quorum was reached
        // are still marked accepted — their vote was cast and they should be in the match.
        await tx.schedulingCandidate.updateMany({
          where: { id: { in: acceptingCandidateIds }, status: { in: ['waiting_reply', 'contacted', 'responded', 'expired'] } },
          data: { status: 'accepted', responseAt: new Date() },
        });
        await tx.schedulingRequest.update({
          where: { id: requestId },
          data: { status: 'completed' },
        });
      });

      logger.info('MultiDatePollQuorumReached', { requestId, confirmedDateTime, overrideSlotUTC });
      void recordEvent({ schedulingRequestId: requestId, action: 'request_completed', metadata: { via: 'poll', confirmedDateTime, overrideSlotUTC } });
      await this.completeScheduling(requestId, overrideSlotUTC, dateStr);
      return;
    }

    if (latestVotes.size < required) return; // not enough voters yet

    // Count votes per slot
    const voteCounts = new Map<string, number>();
    for (const hours of latestVotes.values()) {
      for (const h of hours) {
        voteCounts.set(h, (voteCounts.get(h) ?? 0) + 1);
      }
    }

    // Find confirmed slots within request window, sorted earliest first.
    // Use the request timezone so slot hours match what was shown in the poll buttons.
    const tz = (request as RequestRow).timezone ?? 'UTC';
    const localStartHHMM = formatInTz(request.startTime, 'en-US', { hour: '2-digit', minute: '2-digit', hour12: false }, tz);
    const localEndHHMM = formatInTz(request.endTime, 'en-US', { hour: '2-digit', minute: '2-digit', hour12: false }, tz);
    const windowSlots = slotsInRange(localStartHHMM, localEndHHMM);
    // A slot requires ALL required players to have voted for it — not just any required count.
    const confirmedSlots = windowSlots.filter((slot) => {
      const h = slot.slice(0, 2);
      let count = 0;
      for (const hours of latestVotes.values()) {
        if (hours.includes(h)) count++;
      }
      return count >= required;
    });

    if (confirmedSlots.length === 0) return; // no quorum yet

    // Pick best slot (earliest, or earliest with court available if booking enabled).
    // Convert local bestSlot to UTC for completeScheduling.
    const utcStartH = new Date(request.startTime).getUTCHours();
    const localStartH = Number(localStartHHMM.slice(0, 2));
    const tzOffsetH = localStartH - utcStartH; // e.g. +2 for Europe/Madrid in summer

    let bestSlot = confirmedSlots[0];
    if ((request as RequestRow & { bookingEnabled?: boolean }).bookingEnabled) {
      const hostUser = request.hostUser;
      if (hostUser) {
        const dateStr = new Date(request.date).toISOString().slice(0, 10);
        const hostMembership = await prisma.clubMembership.findFirst({
          where: { userId: hostUser.id, status: 'active', encryptedPassword: { not: null } },
        });
        if (hostMembership) {
          let found: string | null = null;
          for (const slot of confirmedSlots) {
            const nextH = String(Number(slot.slice(0, 2)) + 1).padStart(2, '0');
            const courtSlot = await pickBestSlotInRange(
              hostUser.id, hostMembership.clubSlug, dateStr, request.sportType, slot, `${nextH}:00`,
            );
            if (courtSlot === slot) { found = slot; break; }
          }
          if (!found) {
            await notifyNoCourtsAtQuorum(requestId);
            return;
          }
          bestSlot = found;
        }
      }
    }

    // Convert bestSlot (local) to UTC before passing to completeScheduling
    const bestSlotUtcH = ((Number(bestSlot.slice(0, 2)) - tzOffsetH) + 24) % 24;
    const bestSlotUTC = `${String(bestSlotUtcH).padStart(2, '0')}:00`;

    // Only mark candidates who voted for bestSlot as accepted
    const bestSlotH = bestSlot.slice(0, 2);
    const acceptingCandidateIds = [...latestVotes.entries()]
      .filter(([, hours]) => hours.includes(bestSlotH))
      .map(([id]) => id)
      .slice(0, required);

    await prisma.$transaction(async (tx) => {
      // Include 'expired' so candidates whose window elapsed before quorum was reached
      // are still marked accepted — their vote was cast and they should be in the match.
      await tx.schedulingCandidate.updateMany({
        where: { id: { in: acceptingCandidateIds }, status: { in: ['waiting_reply', 'contacted', 'responded', 'expired'] } },
        data: { status: 'accepted', responseAt: new Date() },
      });
      await tx.schedulingRequest.update({
        where: { id: requestId },
        data: { status: 'completed' },
      });
    });

    logger.info('PollQuorumReached', { requestId, bestSlot, bestSlotUTC, confirmedSlots });
    void recordEvent({ schedulingRequestId: requestId, action: 'request_completed', metadata: { via: 'poll', bestSlot, bestSlotUTC } });

    await this.completeScheduling(requestId, bestSlotUTC);
  },

  async expireCandidate(candidateId: string): Promise<void> {
    const candidate = await prisma.schedulingCandidate.findUnique({
      where: { id: candidateId },
      include: {
        contactUser: true,
        schedulingRequest: { include: { hostUser: true } },
      },
    });
    if (!candidate || candidate.status !== 'waiting_reply') return;

    await schedulingRepository.updateCandidateStatus(candidateId, 'expired');
    logger.info('InviteExpired', { requestId: candidate.schedulingRequestId, candidateId });
    void recordEvent({ schedulingRequestId: candidate.schedulingRequestId, action: 'invite_expired', candidateId });
    await this.contactNextCandidates(candidate.schedulingRequestId);
  },

  async expireWaitingCandidates(): Promise<number> {
    const candidates = await schedulingRepository.findWaitingReplyCandidatesToExpire();
    for (const c of candidates) {
      await this.expireCandidate(c.id);
    }
    return candidates.length;
  },

  async expireRequestsPastScheduledTime(): Promise<number> {
    const requests = await schedulingRepository.findActivePastScheduledTime();
    const now = new Date();
    let expired = 0;
    for (const r of requests) {
      // Skip multi-date requests that still have a future date remaining
      const additionalDates = parseAdditionalDates(r.additionalDates);
      if (additionalDates.length > 0) {
        const hasFutureDate = additionalDates.some(entry => {
          const dObj = new Date(entry.date);
          const [sh, sm] = entry.startTime.split(':').map(Number);
          const futureDt = new Date(Date.UTC(
            dObj.getUTCFullYear(), dObj.getUTCMonth(), dObj.getUTCDate(), sh, sm, 0,
          ));
          return futureDt > now;
        });
        if (hasFutureDate) continue;
      }
      await schedulingRepository.updateRequestStatus(r.id, 'expired');
      logger.info('SchedulingExpired', { requestId: r.id, reason: 'scheduled_time_passed' });
      void recordEvent({ schedulingRequestId: r.id, action: 'request_expired', metadata: { reason: 'scheduled_time_passed' } });
      const fullRequest = await schedulingRepository.findRequestById(r.id);
      if (fullRequest) {
        void logServerEvent(fullRequest.hostUserId, 'scheduling.no_match', { requestId: r.id });
        await notifyHostSchedulingNoMatch(fullRequest, 'scheduled_time_passed');
      }
      expired++;
    }
    return expired;
  },

  async completeScheduling(requestId: string, overrideSlotHHMM?: string, overrideDateStr?: string): Promise<void> {
    const request = await prisma.schedulingRequest.findUnique({
      where: { id: requestId },
      include: {
        hostUser: true,
        hostPartner: true,
        candidates: { orderBy: { priorityOrder: 'asc' }, include: { contactUser: true } },
      },
    });

    if (!request || request.status !== 'completed') return;
    if (request.matchId) return; // Already completed; guard against double execution

    const format = (request as RequestRow).format || 'singles';
    const acceptedCandidates = (request.candidates ?? []).filter((c) => c.status === 'accepted');
    const required = getRequiredAcceptances(format);
    if (acceptedCandidates.length < required) return;

    const hostUser = request.hostUser;
    if (!hostUser) return;

    // Derive scheduledAt from request.date + the best slot within [startTime, endTime).
    // When bookingEnabled and the host has an active club membership, pick the earliest
    // slot in the range that has a court available (pure Redis cache read, no Puppeteer).
    // Falls back to startTime when the cache is cold or no courts are found.
    const reqDate = overrideDateStr ? new Date(overrideDateStr) : new Date(request.date);
    const reqStartTime = new Date(request.startTime);
    const reqEndTime = new Date(request.endTime);
    const dateStr = reqDate.toISOString().slice(0, 10);
    const startHHMM = `${String(reqStartTime.getUTCHours()).padStart(2, '0')}:${String(reqStartTime.getUTCMinutes()).padStart(2, '0')}`;
    const endHHMM = `${String(reqEndTime.getUTCHours()).padStart(2, '0')}:${String(reqEndTime.getUTCMinutes()).padStart(2, '0')}`;

    let matchedHHMM = overrideSlotHHMM ?? startHHMM;
    if (!overrideSlotHHMM && request.bookingEnabled) {
      const hostMembership = await prisma.clubMembership.findFirst({
        where: { userId: hostUser.id, status: 'active', encryptedPassword: { not: null } },
      });
      if (hostMembership) {
        matchedHHMM = await pickBestSlotInRange(
          hostUser.id,
          hostMembership.clubSlug,
          dateStr,
          request.sportType,
          startHHMM,
          endHHMM,
        );
      }
    }

    const [matchedH, matchedM] = matchedHHMM.split(':').map(Number);
    const scheduledAt = new Date(Date.UTC(
      reqDate.getUTCFullYear(),
      reqDate.getUTCMonth(),
      reqDate.getUTCDate(),
      matchedH,
      matchedM,
      0,
    ));
    const matchType = request.matchType === 'practice' ? 'practice' : 'competitive';

    let hostPartnerUserId: string | undefined;
    let opponentUserId: string;
    let opponentPartnerUserId: string | undefined;

    if (format === 'doubles') {
      // host + 3 accepted = 4 players. Use 1st as host partner, 2nd as opponent, 3rd as opponent partner.
      const [c1, c2, c3] = acceptedCandidates;
      if (!c1?.contactUser || !c2?.contactUser || !c3?.contactUser) return;
      hostPartnerUserId = c1.contactUser.id;
      opponentUserId = c2.contactUser.id;
      opponentPartnerUserId = c3.contactUser.id;
    } else {
      const [c1] = acceptedCandidates;
      if (!c1?.contactUser) return;
      opponentUserId = c1.contactUser.id;
    }

    const participantUserIds = [hostUser.id, opponentUserId];
    if (hostPartnerUserId) participantUserIds.push(hostPartnerUserId);
    if (opponentPartnerUserId) participantUserIds.push(opponentPartnerUserId);

    const match = await prisma.$transaction(async (tx) => {
      const availability = await tx.availability.create({
        data: {
          userId: hostUser.id,
          date: request.date,
          startTime: request.startTime,
          endTime: request.endTime,
          locationText: request.locationText,
          status: 'matched',
        },
      });

      const created = await createMatch(
        {
          participantUserIds,
          scheduledAt: scheduledAt.toISOString(),
          availabilityId: availability.id,
          type: matchType,
        },
        tx
      );

      await tx.schedulingRequest.update({
        where: { id: requestId },
        data: { matchId: created.id },
      });

      return created;
    });

    logger.info('MatchCreated', { matchId: match.id, requestId });

    // Notify contacted candidates who were not selected for the match
    for (const candidate of request.candidates) {
      if (['contacted', 'waiting_reply'].includes(candidate.status)) {
        void sendInviteNoLongerAvailable(request, candidate);
      }
    }

    // Trigger court booking if the scheduling request opted in
    if ((request as { bookingEnabled?: boolean }).bookingEnabled) {
      triggerBookingForMatch(match.id).catch((err) => {
        logger.error('Failed to trigger booking for scheduling match', { matchId: match.id, requestId, error: err instanceof Error ? err.message : err });
      });
    }

    // Notify all match participants
    await notifyMatchParticipantsOnCreate(match, (request as RequestRow).timezone ?? 'UTC');

    const userIdsForWhatsApp = match.participants.map((p) => p.userId);
    const uniqueUserIds = [...new Set(userIdsForWhatsApp)];

    const usersWithPhones = await prisma.user.findMany({
      where: { id: { in: uniqueUserIds }, phone: { not: null } },
      select: { id: true, name: true, phone: true, locale: true },
    });
    const participantPhones = usersWithPhones.map((u) => u.phone).filter((p): p is string => !!p);

    // Use host's locale for group messages
    const hostUserLocale = (request.hostUser as { locale?: string | null } | null | undefined)?.locale ?? 'es';

    const whapiBotPhone =
      process.env.WHATSAPP_BOT_NUMBER ||
      process.env.WHAPI_BOT_PHONE ||
      process.env.WHAPI_ACCOUNT_NUMBER;

    if (participantPhones.length >= 1) {
      const tz = (request as RequestRow).timezone ?? 'UTC';
      const intlLocale = resolveLocale(hostUserLocale) === 'es' ? 'es-ES' : 'en-US';
      const dateStr = formatInTz(scheduledAt, intlLocale, { weekday: 'long', month: 'long', day: 'numeric' }, tz);
      const timeStr = formatInTz(scheduledAt, intlLocale, { hour: '2-digit', minute: '2-digit' }, tz);
      const whenStr = `${dateStr} · ${timeStr}`;

      const normalizeDigits = (phone: string) => phone.replace(/\D/g, '');
      const participantByDigits = new Map(
        usersWithPhones
          .filter((u) => !!u.phone)
          .map((u) => [normalizeDigits(u.phone as string), { id: u.id, name: u.name || '', locale: u.locale }])
      );
      const allNames = usersWithPhones.map((u) => u.name).filter((n): n is string => !!n && n.trim().length > 0);

      const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
      const firstName = (full: string) => full.trim().split(/\s+/)[0] ?? full.trim();
      const nameLabel = format !== 'doubles' && allNames.length > 0
        ? allNames.map(firstName).join(' · ')
        : null;
      const groupName = nameLabel
        ? `${capitalize(dateStr)} · ${timeStr} · ${nameLabel}`
        : `${capitalize(dateStr)} · ${timeStr}`;

      // Look up most recent match with the same participant set that already has a WhatsApp group
      const previousMatchWithGroup = await prisma.match.findFirst({
        where: {
          id: { not: match.id },
          whatsappGroupId: { not: null },
          participants: { every: { userId: { in: participantUserIds } } },
        },
        include: { participants: { select: { userId: true } } },
        orderBy: { createdAt: 'desc' },
      });
      // Verify exact participant count (Prisma `every` alone doesn't enforce the count)
      const existingGroupId =
        previousMatchWithGroup &&
        previousMatchWithGroup.participants.length === participantUserIds.length
          ? (previousMatchWithGroup.whatsappGroupId ?? undefined)
          : undefined;

      const groupResult = await whatsappService.createMatchGroup({
        participantPhones,
        groupName,
        botPhone: whapiBotPhone || undefined,
        existingGroupId,
      });

      if (groupResult.success && groupResult.groupId) {
        logger.info('WhatsappGroupReady', { groupId: groupResult.groupId, matchId: match.id, groupName, reused: groupResult.reused ?? false });
        await prisma.match.update({
          where: { id: match.id },
          data: { whatsappGroupId: groupResult.groupId },
        });
        const publicMatchUrl = `${FRONTEND_BASE.replace(/\/$/, '')}/#/matches/${match.id}`;
        const groupLocale = await resolveGroupMessageLocale(request.hostUserId, participantUserIds, format);
        const detailsMessage = formatMatchDetailsMessage(
          request.sportType,
          format,
          whenStr,
          request.locationText,
          publicMatchUrl,
          groupLocale
        );
        await whatsappService.sendGroupMessage(groupResult.groupId, detailsMessage);

        // Only send group invite links for new groups — participants are already in a reused group
        if (!groupResult.reused) {
          const inviteFallback = await whatsappService.ensureParticipantsReceiveGroupInvite(
            groupResult.groupId,
            participantPhones,
            (missingDigitsPhone: string) => {
              const recipient = participantByDigits.get(normalizeDigits(missingDigitsPhone));
              const recipientName = recipient?.name?.trim();
              const others = usersWithPhones
                .filter((u) => u.id !== recipient?.id)
                .map((u) => u.name)
                .filter((n): n is string => !!n && n.trim().length > 0);

              const rivalOrPlayersStr =
                format === 'singles'
                  ? others[0] || (allNames.length >= 2 ? allNames.filter((n) => n !== recipientName)[0] : undefined)
                  : others.length > 0
                    ? others.join(', ')
                    : undefined;

              return formatGroupInviteMessage({
                sportType: request.sportType,
                format,
                whenStr,
                location: request.locationText,
                rivalOrPlayersStr,
                matchUrl: publicMatchUrl,
                locale: recipient?.locale ?? hostUserLocale,
              });
            },
            whapiBotPhone || undefined
          );
          if (inviteFallback.sentTo.length > 0) {
            logger.info('GroupInviteLinksSent', {
              groupId: groupResult.groupId,
              sentTo: inviteFallback.sentTo,
              count: inviteFallback.sentTo.length,
            });
          }
          if (inviteFallback.errors.length > 0) {
            logger.warn('GroupInviteLinkErrors', {
              groupId: groupResult.groupId,
              errors: inviteFallback.errors,
            });
          }
        }
      }
    }

    void recordEvent({ schedulingRequestId: requestId, action: 'request_completed', metadata: { matchId: match.id } });
    void logServerEvent(request.hostUserId, 'scheduling.invite_accepted', { requestId, matchId: match.id });
    logger.info('SchedulingCompleted', { requestId, matchId: match.id });
  },

  async retryCandidate(requestId: string, candidateId: string, userId: string): Promise<SchedulingRequestDTO> {
    const request = await schedulingRepository.findRequestById(requestId);
    if (!request) throw new AppError('Scheduling request not found', 404);
    if (request.hostUserId !== userId) throw new AppError('Only the host can retry', 403);
    if (!['active', 'expired'].includes(request.status)) {
      throw new AppError('Request must be active or expired to retry', 400);
    }

    const candidate = request.candidates?.find((c) => c.id === candidateId);
    if (!candidate) throw new AppError('Candidate not found', 404);
    const retryable = ['expired', 'cancelled', 'send_failed'].includes(candidate.status);
    if (!retryable) throw new AppError('Only expired, cancelled, or send_failed candidates can be retried', 400);

    const maxRetry = await schedulingRepository.getMaxRetryOrder(requestId);
    const retryOrder = maxRetry + 1;
    await schedulingRepository.retryCandidate(candidateId, retryOrder);
    void recordEvent({ schedulingRequestId: requestId, action: 'candidate_retried', candidateId, actorUserId: userId });

    if (request.status === 'expired') {
      await schedulingRepository.updateRequestStatus(requestId, 'active');
    }
    await this.contactNextCandidates(requestId);

    const updated = await schedulingRepository.findRequestById(requestId);
    if (!updated) throw new AppError('Failed to load updated request', 500);
    return toRequestDTOWithCandidates(updated);
  },

  async addCandidates(requestId: string, candidateUserIds: string[], userId: string): Promise<SchedulingRequestDTO> {
    const request = await schedulingRepository.findRequestById(requestId);
    if (!request) throw new AppError('Scheduling request not found', 404);
    if (request.hostUserId !== userId) throw new AppError('Only the host can add candidates', 403);
    if (request.status === 'completed') throw new AppError('Cannot add candidates to a completed match', 400);
    if (request.status === 'cancelled') throw new AppError('Cannot add candidates to a cancelled request', 400);

    const invalidCandidate = candidateUserIds.find((id) => id === request.hostUserId);
    if (invalidCandidate) {
      throw new AppError('You cannot invite yourself as a candidate', 400);
    }

    const existingIds = new Set((request.candidates ?? []).map((c) => c.contactUserId));
    const toAdd = candidateUserIds.filter((id) => !existingIds.has(id));
    if (toAdd.length === 0) {
      const updated = await schedulingRepository.findRequestById(requestId);
      return updated ? toRequestDTOWithCandidates(updated) : toRequestDTOWithCandidates(request);
    }

    await schedulingRepository.addCandidates(requestId, toAdd);
    void recordEvent({ schedulingRequestId: requestId, action: 'candidates_added', actorUserId: userId, metadata: { count: toAdd.length } });

    if (request.status === 'expired') {
      await schedulingRepository.updateRequestStatus(requestId, 'active');
    }
    await this.contactNextCandidates(requestId);

    const updated = await schedulingRepository.findRequestById(requestId);
    if (!updated) throw new AppError('Failed to load updated request', 500);
    logger.info('CandidatesAdded', { requestId, count: toAdd.length, userId });
    return toRequestDTOWithCandidates(updated);
  },

  async manualAcceptCandidate(
    requestId: string,
    candidateId: string,
    userId: string
  ): Promise<SchedulingRequestDTO> {
    const request = await schedulingRepository.findRequestById(requestId);
    if (!request) throw new AppError('Scheduling request not found', 404);
    if (request.hostUserId !== userId) throw new AppError('Only the host can accept candidates', 403);
    if (request.status === 'completed') throw new AppError('Match already completed', 400);
    if (request.status === 'cancelled') throw new AppError('Cannot accept on a cancelled request', 400);

    const candidate = (request.candidates ?? []).find((c) => c.id === candidateId);
    if (!candidate) throw new AppError('Candidate not found', 404);
    if (candidate.status === 'accepted') throw new AppError('Candidate already accepted', 400);
    if (candidate.status === 'declined') throw new AppError('Candidate declined; cannot manually accept', 400);

    const now = new Date();
    await schedulingRepository.updateCandidateStatus(candidateId, 'accepted', now);
    void recordEvent({ schedulingRequestId: requestId, action: 'invite_manually_accepted', candidateId, actorUserId: userId });
    const format = (request as RequestRow).format || 'singles';
    const required = getRequiredAcceptances(format);
    // +1 because we just accepted this candidate (not yet reflected in request.candidates)
    const acceptedCount = (request.candidates ?? []).filter((c) => c.status === 'accepted').length + 1;
    if (acceptedCount >= required) {
      await schedulingRepository.updateRequestStatus(requestId, 'completed');
      logger.info('ManualAccept', { requestId, candidateId, userId });
      await this.completeScheduling(requestId);
    } else {
      await this.contactNextCandidates(requestId);
    }

    const updated = await schedulingRepository.findRequestById(requestId);
    return updated ? toRequestDTOWithCandidates(updated) : toRequestDTOWithCandidates(request);
  },

  async cancelContactedCandidate(
    requestId: string,
    candidateId: string,
    userId: string
  ): Promise<SchedulingRequestDTO> {
    const request = await schedulingRepository.findRequestById(requestId);
    if (!request) throw new AppError('Scheduling request not found', 404);
    if (request.hostUserId !== userId) throw new AppError('Only the host can cancel candidates', 403);
    if (request.status !== 'active') {
      throw new AppError('Request must be active to cancel a contacted candidate', 400);
    }

    const candidate = (request.candidates ?? []).find((c) => c.id === candidateId);
    if (!candidate) throw new AppError('Candidate not found', 404);
    if (!['contacted', 'waiting_reply'].includes(candidate.status)) {
      throw new AppError('Only contacted candidates can be cancelled this way', 400);
    }

    await schedulingRepository.updateCandidateStatus(candidateId, 'cancelled');
    void recordEvent({ schedulingRequestId: requestId, action: 'candidate_cancelled', candidateId, actorUserId: userId });
    logger.info('ContactedCandidateCancelled', { requestId, candidateId, userId });
    void sendInviteNoLongerAvailable(request, candidate);
    await this.contactNextCandidates(requestId);

    const updated = await schedulingRepository.findRequestById(requestId);
    return updated ? toRequestDTOWithCandidates(updated) : toRequestDTOWithCandidates(request);
  },

  async removeCandidate(
    requestId: string,
    candidateId: string,
    userId: string
  ): Promise<SchedulingRequestDTO> {
    const request = await schedulingRepository.findRequestById(requestId);
    if (!request) throw new AppError('Scheduling request not found', 404);
    if (request.hostUserId !== userId) throw new AppError('Only the host can remove candidates', 403);
    if (!['active', 'expired'].includes(request.status)) {
      throw new AppError('Request must be active or expired to remove a candidate', 400);
    }

    const candidate = (request.candidates ?? []).find((c) => c.id === candidateId);
    if (!candidate) throw new AppError('Candidate not found', 404);
    if (candidate.status !== 'pending') {
      throw new AppError('Only pending candidates can be removed', 400);
    }

    await prisma.schedulingCandidate.delete({ where: { id: candidateId } });
    logger.info('CandidateRemoved', { requestId, candidateId, userId });

    const updated = await schedulingRepository.findRequestById(requestId);
    return updated ? toRequestDTOWithCandidates(updated) : toRequestDTOWithCandidates(request);
  },

  async cancelAcceptedCandidate(
    requestId: string,
    candidateId: string,
    userId: string
  ): Promise<SchedulingRequestDTO> {
    const request = await schedulingRepository.findRequestById(requestId);
    if (!request) throw new AppError('Scheduling request not found', 404);
    if (request.hostUserId !== userId) throw new AppError('Only the host can cancel accepted candidates', 403);
    if (!['active', 'completed', 'expired'].includes(request.status)) {
      throw new AppError('Request must be active, completed, or expired', 400);
    }

    const candidate = (request.candidates ?? []).find((c) => c.id === candidateId);
    if (!candidate) throw new AppError('Candidate not found', 404);
    if (candidate.status !== 'accepted') throw new AppError('Candidate has not accepted; nothing to cancel', 400);

    const matchId = request.matchId;
    if (request.status === 'completed' && matchId) {
      try {
        await cancelMatch(matchId, userId);
      } catch (e) {
        logger.warn('Could not cancel match when reverting acceptance', { matchId, requestId, error: e });
      }
    }

    await prisma.schedulingRequest.update({
      where: { id: requestId },
      data: { status: 'active', matchId: null },
    });
    await schedulingRepository.updateCandidateStatus(candidateId, 'cancelled');
    void recordEvent({ schedulingRequestId: requestId, action: 'candidate_cancelled', candidateId, actorUserId: userId });
    logger.info('AcceptedCandidateCancelled', { requestId, candidateId, userId });
    await this.contactNextCandidates(requestId);

    const updated = await schedulingRepository.findRequestById(requestId);
    return updated ? toRequestDTOWithCandidates(updated) : toRequestDTOWithCandidates(request);
  },

  async cancelSchedulingRequest(requestId: string, userId: string): Promise<SchedulingRequestDTO> {
    const request = await schedulingRepository.findRequestById(requestId);
    if (!request) throw new AppError('Scheduling request not found', 404);
    if (request.hostUserId !== userId) throw new AppError('Only the host can cancel', 403);
    if (request.status === 'cancelled') return toRequestDTOWithCandidates(request);
    if (request.status === 'completed') throw new AppError('Cannot cancel a completed match', 400);

    const candidates = request.candidates ?? [];
    const toNotify = candidates.filter((c) =>
      ['contacted', 'waiting_reply', 'accepted'].includes(c.status)
    );

    for (const c of toNotify) {
      void sendInviteNoLongerAvailable(request, c);
      await schedulingRepository.updateCandidateStatus(c.id, 'cancelled');
    }

    const pendingIds = candidates
      .filter((c) => c.status === 'pending')
      .map((c) => c.id);
    for (const id of pendingIds) {
      await schedulingRepository.updateCandidateStatus(id, 'cancelled');
    }

    await schedulingRepository.updateRequestStatus(requestId, 'cancelled');
    void recordEvent({ schedulingRequestId: requestId, action: 'request_cancelled', actorUserId: userId });
    logger.info('SchedulingCancelled', { requestId, userId });
    void logServerEvent(userId, 'scheduling.request_cancelled', { requestId });
    const updated = await schedulingRepository.findRequestById(requestId);
    return updated ? toRequestDTOWithCandidates(updated) : toRequestDTO(request);
  },

  async getInviteLink(requestId: string, baseUrl?: string): Promise<string> {
    const request = await schedulingRepository.findRequestById(requestId);
    if (!request) throw new AppError('Scheduling request not found', 404);

    const base = baseUrl || process.env.APP_BASE_URL || 'https://v0-tennis-matchmaker-mvp.vercel.app';
    const path = `/join/${request.inviteToken}`;
    return base.endsWith('/') ? `${base.slice(0, -1)}${path}` : `${base}${path}`;
  },

  async getActiveCount(hostUserId: string): Promise<{ active: number; max: number }> {
    const active = await schedulingRepository.countActiveByHostUserId(hostUserId);
    return { active, max: MAX_ACTIVE_SCHEDULING_REQUESTS };
  },

  async getSchedulingRequestById(requestId: string): Promise<SchedulingRequestDTO | null> {
    const request = await schedulingRepository.findRequestById(requestId);
    return request ? toRequestDTOWithCandidates(request) : null;
  },

  async getSchedulingRequestByToken(token: string): Promise<SchedulingRequestDTO | null> {
    const request = await schedulingRepository.findRequestByInviteToken(token);
    return request ? toRequestDTOWithCandidates(request) : null;
  },

  async listSchedulingRequestsByHost(hostUserId: string): Promise<SchedulingRequestDTO[]> {
    await this.expireRequestsPastScheduledTime();
    const requests = await prisma.schedulingRequest.findMany({
      where: { hostUserId },
      include: {
        hostUser: true,
        hostPartner: true,
        candidates: { orderBy: { priorityOrder: 'asc' }, include: { contactUser: true } },
        match: { select: { whatsappGroupId: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
    const ids = requests.map((r) => r.id);
    const noCourtsIds = ids.length > 0
      ? new Set((await prisma.schedulingInviteEvent.findMany({
          where: { schedulingRequestId: { in: ids }, action: 'no_courts_at_quorum' },
          select: { schedulingRequestId: true },
        })).map((e) => e.schedulingRequestId))
      : new Set<string>();
    return requests.map((r) => toRequestDTOWithCandidates({ ...r, noCourtsAtQuorum: noCourtsIds.has(r.id) }));
  },

  async getEventHistory(requestId: string): Promise<SchedulingInviteEventDTO[]> {
    const events = await prisma.schedulingInviteEvent.findMany({
      where: { schedulingRequestId: requestId },
      orderBy: { createdAt: 'asc' },
      include: {
        candidate: { include: { contactUser: { select: { name: true } } } },
      },
    });

    const actorIds = [...new Set(events.map((e) => e.actorUserId).filter((id): id is string => !!id))];
    const actors = actorIds.length > 0
      ? await prisma.user.findMany({ where: { id: { in: actorIds } }, select: { id: true, name: true } })
      : [];
    const actorMap = new Map(actors.map((u) => [u.id, u.name]));

    return events.map((e) => ({
      id: e.id,
      schedulingRequestId: e.schedulingRequestId,
      candidateId: e.candidateId,
      candidateUserName: e.candidate?.contactUser?.name ?? null,
      actorUserId: e.actorUserId,
      actorUserName: e.actorUserId ? (actorMap.get(e.actorUserId) ?? null) : null,
      action: e.action as SchedulingInviteEventDTO['action'],
      metadata: e.metadata as Record<string, unknown> | null,
      createdAt: e.createdAt.toISOString(),
    }));
  },

  async listIncomingInvites(userId: string): Promise<SchedulingRequestDTO[]> {
    const candidates = await schedulingRepository.findIncomingCandidatesByUserId(userId);
    const requestIds = [...new Set(candidates.map((c) => c.schedulingRequestId))];
    if (requestIds.length === 0) return [];

    const requests = await prisma.schedulingRequest.findMany({
      where: { id: { in: requestIds } },
      include: {
        hostUser: true,
        hostPartner: true,
        candidates: { orderBy: { priorityOrder: 'asc' }, include: { contactUser: true } },
        match: { select: { whatsappGroupId: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
    return requests.map(toRequestDTOWithCandidates);
  },

  async getSchedulingRequestForJoin(token: string): Promise<PublicSchedulingInviteDTO | null> {
    const request = await prisma.schedulingRequest.findFirst({
      where: { inviteToken: token },
      include: { hostUser: { select: { name: true } } },
    });
    if (!request) return null;
    return {
      id: request.id,
      hostName: request.hostUser?.name ?? 'Unknown',
      sportType: request.sportType as PublicSchedulingInviteDTO['sportType'],
      format: (request.format || 'singles') as PublicSchedulingInviteDTO['format'],
      matchType: (request.matchType || 'competitive') as PublicSchedulingInviteDTO['matchType'],
      date: request.date.toISOString(),
      startTime: request.startTime.toISOString(),
      locationText: request.locationText,
      status: request.status,
      bookingEnabled: (request as { bookingEnabled?: boolean }).bookingEnabled ?? false,
      matchId: request.matchId,
    };
  },

  async acceptViaLink(
    token: string,
    data: { name: string; phone: string; email?: string; socioNumber?: string }
  ): Promise<{ status: 'accepted' | 'already_filled'; candidateId: string | null; matchId: string | null }> {
    const request = await prisma.schedulingRequest.findFirst({
      where: { inviteToken: token },
    });
    if (!request) throw new AppError('Invite not found', 404);

    if (request.status === 'cancelled') {
      throw new AppError('Invite is no longer active', 409);
    }

    if (request.status === 'completed') {
      return { status: 'already_filled', matchId: request.matchId, candidateId: null };
    }

    // Normalize phone and find or create user
    const normalizedPhone = normalizePhoneToCanonical(data.phone);
    let user = await findUserByNormalizedPhone(data.phone);
    if (!user) {
      user = await createGuestUser(data.name, data.email, normalizedPhone || data.phone);
    }
    const userId = user.id;

    // Idempotency check: already accepted
    const existingAccepted = await prisma.schedulingCandidate.findFirst({
      where: { schedulingRequestId: request.id, contactUserId: userId, status: 'accepted' },
    });
    if (existingAccepted) {
      return { status: 'accepted', candidateId: existingAccepted.id, matchId: request.matchId };
    }

    const { candidateId, didComplete } = await prisma.$transaction(async (tx) => {
      const existing = await tx.schedulingCandidate.findFirst({
        where: { schedulingRequestId: request.id, contactUserId: userId },
      });

      let candidateId: string;
      if (existing) {
        await tx.schedulingCandidate.update({
          where: { id: existing.id },
          data: { status: 'accepted', responseAt: new Date() },
        });
        candidateId = existing.id;
      } else {
        const maxPriorityRow = await tx.schedulingCandidate.findFirst({
          where: { schedulingRequestId: request.id },
          orderBy: { priorityOrder: 'desc' },
          select: { priorityOrder: true },
        });
        const maxPriority = maxPriorityRow?.priorityOrder ?? -1;
        const created = await tx.schedulingCandidate.create({
          data: {
            schedulingRequestId: request.id,
            contactUserId: userId,
            priorityOrder: maxPriority + 1,
            retryOrder: 0,
            status: 'accepted',
            responseAt: new Date(),
          },
        });
        candidateId = created.id;
      }

      const allCandidates = await tx.schedulingCandidate.findMany({
        where: { schedulingRequestId: request.id },
        select: { status: true },
      });
      const acceptedCount = allCandidates.filter((c) => c.status === 'accepted').length;
      const format = (request as RequestRow).format || 'singles';
      const required = getRequiredAcceptances(format);

      let didComplete = false;
      if (acceptedCount >= required) {
        const updated = await tx.schedulingRequest.updateMany({
          where: { id: request.id, status: { not: 'completed' } },
          data: { status: 'completed' },
        });
        didComplete = updated.count > 0;
      }

      return { candidateId, didComplete };
    });

    void recordEvent({
      schedulingRequestId: request.id,
      action: 'invite_link_accepted',
      candidateId,
      actorUserId: userId,
      metadata: { userName: data.name, source: 'link' },
    });

    if (didComplete) {
      await this.completeScheduling(request.id);
    }

    // Persist socioNumber as a ClubMembership for the guest so the booking service
    // can include them when booking the court for this match.
    if (data.socioNumber && (request as { bookingEnabled?: boolean }).bookingEnabled) {
      const hostMembership = await prisma.clubMembership.findFirst({
        where: { userId: request.hostUserId, status: 'active' },
        select: { clubSlug: true, adapterType: true },
      });
      if (hostMembership) {
        await prisma.clubMembership.upsert({
          where: { userId_clubSlug: { userId, clubSlug: hostMembership.clubSlug } },
          create: {
            id: crypto.randomUUID(),
            userId,
            clubSlug: hostMembership.clubSlug,
            adapterType: hostMembership.adapterType,
            socioNumber: data.socioNumber,
            status: 'unverified',
          },
          update: { socioNumber: data.socioNumber },
        });
        logger.info('GuestClubMembershipUpserted', { userId, clubSlug: hostMembership.clubSlug, schedulingRequestId: request.id });
      } else {
        logger.warn('SocioNumberReceivedButNoHostMembership', { userId, schedulingRequestId: request.id });
      }
    }

    return { status: 'accepted', candidateId, matchId: null };
  },
};
