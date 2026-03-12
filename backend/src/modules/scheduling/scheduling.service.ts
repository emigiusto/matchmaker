// scheduling.service.ts
// Core automation logic for sequential match scheduling via WhatsApp

import crypto from 'crypto';
import { prisma } from '../../prisma';
import { AppError } from '../../shared/errors/AppError';
import { logger } from '../../config/logger';
import { schedulingRepository } from './scheduling.repository';
import { whatsappService } from '../whatsapp/whatsapp.service';
import { createMatch, cancelMatch, notifyMatchParticipantsOnCreate } from '../matches/matches.service';
import type {
  CreateSchedulingRequestInput,
  SchedulingRequestDTO,
  SchedulingCandidateDTO,
} from './scheduling.types';
import { MAX_ACTIVE_SCHEDULING_REQUESTS, RESPONSE_WINDOW_OPTIONS } from './scheduling.types';

const ACCEPT_PATTERNS = /^(yes|y|accept|👍)$|👍/i;
const DECLINE_PATTERNS = /^(no|n|decline)$/i;

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
  responseWindowMinutes: number;
  maxParallelCandidates: number;
  inviteToken: string;
  status: string;
  currentCandidateIndex: number;
  matchId: string | null;
  match?: { whatsappGroupId: string | null } | null;
  createdAt: Date;
  updatedAt: Date;
};

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
    responseWindowMinutes: r.responseWindowMinutes ?? 240,
    maxParallelCandidates: (r as RequestRow).maxParallelCandidates ?? 1,
    inviteToken: r.inviteToken,
    status: r.status as SchedulingRequestDTO['status'],
    currentCandidateIndex: r.currentCandidateIndex,
    matchId: r.matchId,
    whatsappGroupId: r.match?.whatsappGroupId ?? null,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  };
}

function toRequestDTOWithCandidates(
  r: RequestRow & { candidates?: Array<{ id: string; schedulingRequestId: string; contactUserId: string; contactUser?: { name: string | null } | null; priorityOrder: number; retryOrder?: number | null; status: string; contactedAt: Date | null; responseAt: Date | null; createdAt: Date; updatedAt: Date }> }
): SchedulingRequestDTO {
  const dto = toRequestDTO(r);
  if (r.candidates) {
    dto.candidates = r.candidates.map((c) => ({
      ...toCandidateDTO(c),
      contactUserName: c.contactUser?.name ?? null,
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

/** Quick-reply buttons for invite (Whapi supports; Wasender/Mock fall back to plain text) */
const INVITE_BUTTONS = [
  { id: 'invite_yes', title: 'YES' },
  { id: 'invite_no', title: 'NO' },
] as const;

function formatResponseWindow(minutes: number): string {
  if (minutes < 60) return `${Math.round(minutes)} minute${Math.round(minutes) === 1 ? '' : 's'}`;
  const hours = minutes / 60;
  if (hours < 24) return `${Math.round(hours)} hour${Math.round(hours) === 1 ? '' : 's'}`;
  const days = hours / 24;
  return `${Math.round(days)} day${Math.round(days) === 1 ? '' : 's'}`;
}

function formatInviteMessage(
  hostName: string,
  sportType: string,
  format: string,
  dateStr: string,
  timeStr: string,
  location: string,
  withButtons: boolean,
  responseWindowMinutes: number
): string {
  const formatLabel = format === 'doubles' ? 'doubles' : 'singles';
  const timeLeft = formatResponseWindow(responseWindowMinutes);
  const base = `${hostName} wants to play ${sportType} ${formatLabel} with you.\n\n${dateStr} ${timeStr}\nLocation: ${location}\n\nReply within ${timeLeft}`;
  return withButtons ? base : `${base}\n\nReply YES to accept\nReply NO to decline`;
}

const FRONTEND_BASE = process.env.FRONTEND_BASE_URL || 'https://matchmaker-flame.vercel.app';

function formatMatchDetailsMessage(
  sportType: string,
  format: string,
  whenStr: string,
  location: string,
  matchId: string
): string {
  const sport = sportType.charAt(0).toUpperCase() + sportType.slice(1).toLowerCase();
  const formatLabel = format === 'doubles' ? 'Doubles' : 'Singles';
  const matchUrl = `${FRONTEND_BASE.replace(/\/$/, '')}/matches/${matchId}`;
  const signupUrl = `${FRONTEND_BASE.replace(/\/$/, '')}/signup`;
  return `✅ Match confirmed!\n\n${sport} · ${formatLabel}\nWhen: ${whenStr}\nWhere: ${location}\n\n🔗 View match: ${matchUrl}\n\nCreate an account to manage matches: ${signupUrl}`;
}

function formatInviteNoLongerAvailableMessage(
  hostName: string,
  sportType: string,
  format: string,
  dateStr: string,
  timeStr: string,
  location: string
): string {
  const formatLabel = format === 'doubles' ? 'doubles' : 'singles';
  return `Hi! The ${sportType} ${formatLabel} invite from ${hostName} for ${dateStr} at ${timeStr} (${location}) is no longer available. You can ignore the previous message.`;
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

    // Round to 3 decimal places to avoid float precision issues
    const rawWindow = input.responseWindowMinutes ?? 240;
    const responseWindow = Math.round(rawWindow * 1000) / 1000;
    // Min 10 seconds (0.167 min) for testing, max 24 hours (1440 min)
    if (responseWindow < 10 / 60 || responseWindow > 1440) {
      throw new AppError(
        'Invalid responseWindowMinutes. Use 0.167 (10 sec), 0.333 (20 sec), 1, 5, 15, 30, 60, 120, 240, 600, or 1440 (minutes)',
        400
      );
    }

    const maxParallel = Math.min(3, Math.max(1, input.maxParallelCandidates ?? 1));

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
          locationText: input.locationText,
          radiusKm: input.radiusKm ?? null,
          responseWindowMinutes: responseWindow,
          maxParallelCandidates: maxParallel,
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
    const full = await schedulingRepository.findRequestById(request.id);
    return full ? toRequestDTOWithCandidates(full) : toRequestDTO(request);
  },

  async startScheduling(requestId: string): Promise<SchedulingRequestDTO | null> {
    const request = await schedulingRepository.findActiveOrPausedById(requestId);
    if (!request) return null;
    if (request.status === 'paused') {
      const hasWaiting = await schedulingRepository.hasWaitingReplyCandidate(requestId);
      if (hasWaiting) {
        await schedulingRepository.updateRequestStatus(requestId, 'active');
        const updated = await schedulingRepository.findRequestById(requestId);
        return updated ? toRequestDTOWithCandidates(updated) : null;
      }
      await schedulingRepository.updateRequestStatus(requestId, 'active');
    }

    const activeCount = await schedulingRepository.countActiveByHostUserId(request.hostUserId);
    if (activeCount > MAX_ACTIVE_SCHEDULING_REQUESTS) {
      throw new AppError(`Maximum ${MAX_ACTIVE_SCHEDULING_REQUESTS} active scheduling requests allowed`, 400);
    }

    const pending = await schedulingRepository.findFirstPendingCandidate(requestId);
    if (!pending) {
      await schedulingRepository.updateRequestStatus(requestId, 'expired');
      logger.info('SchedulingExpired', { requestId, reason: 'no_more_candidates' });
      return toRequestDTOWithCandidates({ ...request, status: 'expired' });
    }

    await this.contactNextCandidates(requestId);
    const updated = await schedulingRepository.findRequestById(requestId);
    return updated ? toRequestDTOWithCandidates(updated) : null;
  },

  async contactNextCandidates(requestId: string): Promise<void> {
    const request = await schedulingRepository.findActiveRequestById(requestId);
    if (!request) return;

    const maxParallel = (request as RequestRow & { maxParallelCandidates?: number }).maxParallelCandidates ?? 1;
    const waitingCount = await schedulingRepository.countWaitingReplyCandidates(requestId);
    const slotsToFill = Math.max(0, maxParallel - waitingCount);
    if (slotsToFill === 0) return;

    const toContact = await schedulingRepository.findPendingCandidatesOrdered(requestId, slotsToFill);
    if (toContact.length === 0) {
      const pendingCount = await schedulingRepository.countPendingCandidates(requestId);
      const waitingReplyCount = await schedulingRepository.countWaitingReplyCandidates(requestId);
      if (pendingCount === 0 && waitingReplyCount === 0) {
        await schedulingRepository.updateRequestStatus(requestId, 'expired');
        logger.info('SchedulingExpired', { requestId, reason: 'all_candidates_exhausted' });
      }
      return;
    }

    const hostName = request.hostUser?.name || 'Someone';
    const dateStr = request.date.toLocaleDateString('en-US', { weekday: 'long' });
    const timeStr = `${request.startTime.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })} - ${request.endTime.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}`;
    const format = (request as RequestRow).format || 'singles';
    const message = formatInviteMessage(
        hostName,
        request.sportType,
        format,
        dateStr,
        timeStr,
        request.locationText,
        true,
        request.responseWindowMinutes ?? 240
      );

    for (const candidate of toContact) {
      const phone = candidate.contactUser?.phone;
      const contactName = candidate.contactUser?.name ?? candidate.contactUser?.email ?? candidate.contactUserId;
      if (!phone) {
        logger.warn('InviteSkipped', { candidateId: candidate.id, contactName, reason: 'no_phone' });
        await schedulingRepository.updateCandidateStatus(candidate.id, 'expired');
        continue;
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
        buttons: [...INVITE_BUTTONS],
      });
      await schedulingRepository.updateCandidateStatus(candidate.id, 'waiting_reply');

      if (!result.success) {
        logger.error('InviteSendFailed', { candidateId: candidate.id, contactName, error: result.error });
        await schedulingRepository.updateCandidateStatus(candidate.id, 'expired');
      } else {
        logger.info('InviteSent', { requestId, candidateId: candidate.id, contactUserId: candidate.contactUserId, contactName });
      }
    }
    await this.contactNextCandidates(requestId);
  },

  async handleCandidateResponse(senderPhoneNumber: string, messageText: string): Promise<{ processed: boolean }> {
    const user = await schedulingRepository.findUserByPhone(senderPhoneNumber);
    if (!user) {
      logger.info('InviteResponseIgnored', { reason: 'user_not_found', phone: senderPhoneNumber });
      return { processed: false };
    }

    const candidate = await schedulingRepository.findWaitingReplyCandidateByContactUserId(user.id);
    if (!candidate) {
      logger.info('InviteResponseIgnored', { reason: 'no_waiting_candidate', userId: user.id, phone: senderPhoneNumber });
      return { processed: false };
    }

    const text = (messageText || '').trim();
    const isAccept = ACCEPT_PATTERNS.test(text);
    const isDecline = DECLINE_PATTERNS.test(text);

    if (!isAccept && !isDecline) {
      logger.info('InviteResponseIgnored', { reason: 'unrecognized_text', text: text.slice(0, 50), phone: senderPhoneNumber });
      return { processed: false };
    }

    const request = candidate.schedulingRequest;
    if (request.status !== 'active') {
      logger.warn('InviteIgnored', { reason: 'request_not_active', requestId: request.id });
      return { processed: true };
    }

    const now = new Date();

    if (isAccept) {
      const didComplete = await prisma.$transaction(async (tx) => {
        const updateResult = await tx.schedulingCandidate.updateMany({
          where: { id: candidate.id, status: 'waiting_reply' },
          data: { status: 'accepted', responseAt: now },
        });
        if (updateResult.count === 0) {
          return null; // duplicate or expired
        }
        const format = (request as RequestRow).format || 'singles';
        const required = getRequiredAcceptances(format);
        const candidates = await tx.schedulingCandidate.findMany({
          where: { schedulingRequestId: request.id },
          select: { status: true },
        });
        const acceptedCount = candidates.filter((c) => c.status === 'accepted').length;
        if (acceptedCount >= required) {
          await tx.schedulingRequest.update({
            where: { id: request.id },
            data: { status: 'completed' },
          });
          return true;
        }
        return false;
      });

      if (didComplete === null) {
        logger.warn('InviteDuplicateResponse', { candidateId: candidate.id, action: 'accept' });
        return { processed: true };
      }
      logger.info('InviteAccepted', { requestId: request.id, candidateId: candidate.id });
      if (didComplete) {
        await this.completeScheduling(request.id);
      } else {
        await this.contactNextCandidates(request.id);
      }
      return { processed: true };
    }

    if (isDecline) {
      const updated = await schedulingRepository.updateCandidateFromWaitingReply(candidate.id, 'declined', now);
      if (!updated) {
        logger.warn('InviteDuplicateResponse', { candidateId: candidate.id, action: 'decline' });
        return { processed: true };
      }
      logger.info('InviteDeclined', { requestId: request.id, candidateId: candidate.id });
      await this.contactNextCandidates(request.id);
      return { processed: true };
    }

    return { processed: false };
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

    const phone = candidate.contactUser?.phone;
    if (phone) {
      const req = candidate.schedulingRequest;
      const hostName = req.hostUser?.name ?? 'Someone';
      const dateStr = req.date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
      const timeStr = req.startTime.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
      const format = (req as RequestRow).format || 'singles';
      const msg = formatInviteNoLongerAvailableMessage(hostName, req.sportType, format, dateStr, timeStr, req.locationText);
      const result = await whatsappService.sendInviteMessage(phone, msg);
      if (!result.success) logger.warn('FailedToNotifyInviteExpired', { candidateId, phone });
    }

    await schedulingRepository.updateCandidateStatus(candidateId, 'expired');
    logger.info('InviteExpired', { requestId: candidate.schedulingRequestId, candidateId });
    await this.contactNextCandidates(candidate.schedulingRequestId);
  },

  async expireWaitingCandidates(): Promise<number> {
    const candidates = await schedulingRepository.findWaitingReplyCandidatesToExpire();
    for (const c of candidates) {
      await this.expireCandidate(c.id);
    }
    return candidates.length;
  },

  async completeScheduling(requestId: string): Promise<void> {
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

    const scheduledAt = new Date(request.startTime);
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

    // Notify all match participants
    await notifyMatchParticipantsOnCreate(match);

    const userIdsForWhatsApp = match.participants.map((p) => p.userId);
    const uniqueUserIds = [...new Set(userIdsForWhatsApp)];

    const usersWithPhones = await prisma.user.findMany({
      where: { id: { in: uniqueUserIds }, phone: { not: null } },
      select: { phone: true },
    });
    const participantPhones = usersWithPhones
      .map((u) => u.phone)
      .filter((p): p is string => !!p);

    const whapiBotPhone =
      process.env.WHATSAPP_BOT_NUMBER ||
      process.env.WHAPI_BOT_PHONE ||
      process.env.WHAPI_ACCOUNT_NUMBER;

    if (participantPhones.length >= 1) {
      const dateStr = request.date.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
      const timeStr = request.startTime.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
      const groupName = `${dateStr} ${timeStr}`;

      const groupResult = await whatsappService.createMatchGroup({
        participantPhones,
        groupName,
        botPhone: whapiBotPhone || undefined,
      });

      if (groupResult.success && groupResult.groupId) {
        logger.info('WhatsappGroupCreated', { groupId: groupResult.groupId, matchId: match.id, groupName });
        await prisma.match.update({
          where: { id: match.id },
          data: { whatsappGroupId: groupResult.groupId },
        });
        const detailsMessage = formatMatchDetailsMessage(
          request.sportType,
          format,
          `${dateStr} at ${timeStr}`,
          request.locationText,
          match.id
        );
        await whatsappService.sendGroupMessage(groupResult.groupId, detailsMessage);
      }
    }

    logger.info('SchedulingCompleted', { requestId, matchId: match.id });
  },

  async pauseSchedulingRequest(requestId: string, userId: string): Promise<SchedulingRequestDTO> {
    const request = await schedulingRepository.findActiveRequestById(requestId);
    if (!request) throw new AppError('Scheduling request not found or not active', 404);
    if (request.hostUserId !== userId) throw new AppError('Only the host can pause', 403);

    const updated = await prisma.schedulingRequest.update({
      where: { id: requestId },
      data: { status: 'paused' },
      include: { hostUser: true, hostPartner: true, candidates: { include: { contactUser: true } } },
    });
    logger.info('SchedulingPaused', { requestId, userId });
    return toRequestDTOWithCandidates(updated);
  },

  async resumeSchedulingRequest(requestId: string, userId: string): Promise<SchedulingRequestDTO> {
    const request = await schedulingRepository.findActiveOrPausedById(requestId);
    if (!request) throw new AppError('Scheduling request not found', 404);
    if (request.hostUserId !== userId) throw new AppError('Only the host can resume', 403);
    if (request.status !== 'paused') throw new AppError('Request is not paused', 400);

    const activeCount = await schedulingRepository.countActiveByHostUserId(userId);
    if (activeCount >= MAX_ACTIVE_SCHEDULING_REQUESTS) {
      throw new AppError(`Maximum ${MAX_ACTIVE_SCHEDULING_REQUESTS} active scheduling requests allowed`, 400);
    }

    const updated = await prisma.schedulingRequest.update({
      where: { id: requestId },
      data: { status: 'active' },
      include: { hostUser: true, hostPartner: true, candidates: { include: { contactUser: true } } },
    });
    logger.info('SchedulingResumed', { requestId, userId });
    return toRequestDTOWithCandidates(updated);
  },

  async retryCandidate(requestId: string, candidateId: string, userId: string): Promise<SchedulingRequestDTO> {
    const request = await schedulingRepository.findRequestById(requestId);
    if (!request) throw new AppError('Scheduling request not found', 404);
    if (request.hostUserId !== userId) throw new AppError('Only the host can retry', 403);
    if (!['active', 'paused', 'expired'].includes(request.status)) {
      throw new AppError('Request must be active, paused, or expired to retry', 400);
    }

    const candidate = request.candidates?.find((c) => c.id === candidateId);
    if (!candidate) throw new AppError('Candidate not found', 404);
    const retryable = ['expired', 'cancelled'].includes(candidate.status);
    if (!retryable) throw new AppError('Only expired or cancelled candidates can be retried (not declined)', 400);

    const maxRetry = await schedulingRepository.getMaxRetryOrder(requestId);
    const retryOrder = maxRetry + 1;
    await schedulingRepository.retryCandidate(candidateId, retryOrder);

    if (request.status === 'paused' || request.status === 'expired') {
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

    const existingIds = new Set((request.candidates ?? []).map((c) => c.contactUserId));
    const toAdd = candidateUserIds.filter((id) => !existingIds.has(id));
    if (toAdd.length === 0) {
      const updated = await schedulingRepository.findRequestById(requestId);
      return updated ? toRequestDTOWithCandidates(updated) : toRequestDTOWithCandidates(request);
    }

    await schedulingRepository.addCandidates(requestId, toAdd);

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
    if (!['active', 'paused'].includes(request.status)) {
      throw new AppError('Request must be active or paused to cancel a contacted candidate', 400);
    }

    const candidate = (request.candidates ?? []).find((c) => c.id === candidateId);
    if (!candidate) throw new AppError('Candidate not found', 404);
    if (!['contacted', 'waiting_reply'].includes(candidate.status)) {
      throw new AppError('Only contacted candidates can be cancelled this way', 400);
    }

    const phone = candidate.contactUser?.phone;
    if (phone) {
      const hostName = request.hostUser?.name ?? 'Someone';
      const dateStr = request.date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
      const timeStr = request.startTime.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
      const format = (request as RequestRow).format || 'singles';
      const msg = formatInviteNoLongerAvailableMessage(hostName, request.sportType, format, dateStr, timeStr, request.locationText);
      const result = await whatsappService.sendInviteMessage(phone, msg);
      if (!result.success) logger.warn('FailedToNotifyInviteCancelled', { candidateId, phone });
    }

    await schedulingRepository.updateCandidateStatus(candidateId, 'cancelled');
    logger.info('ContactedCandidateCancelled', { requestId, candidateId, userId });
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
    if (!['active', 'paused', 'expired'].includes(request.status)) {
      throw new AppError('Request must be active, paused, or expired to remove a candidate', 400);
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
    if (!['active', 'paused', 'completed', 'expired'].includes(request.status)) {
      throw new AppError('Request must be active, paused, completed, or expired', 400);
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

    const hostName = request.hostUser?.name ?? 'Someone';
    const dateStr = request.date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
    const timeStr = request.startTime.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
    const format = (request as RequestRow).format || 'singles';
    const msg = formatInviteNoLongerAvailableMessage(
      hostName,
      request.sportType,
      format,
      dateStr,
      timeStr,
      request.locationText
    );

    const candidates = request.candidates ?? [];
    const toNotify = candidates.filter((c) =>
      ['contacted', 'waiting_reply', 'accepted'].includes(c.status)
    );

    for (const c of toNotify) {
      const phone = c.contactUser?.phone;
      if (phone) {
        try {
          const result = await whatsappService.sendInviteMessage(phone, msg);
          if (!result.success) logger.warn('FailedToNotifyInviteCancelled', { candidateId: c.id, phone });
        } catch (e) {
          logger.warn('FailedToNotifyInviteCancelled', { candidateId: c.id, error: e });
        }
      }
      await schedulingRepository.updateCandidateStatus(c.id, 'cancelled');
    }

    const pendingIds = candidates
      .filter((c) => c.status === 'pending')
      .map((c) => c.id);
    for (const id of pendingIds) {
      await schedulingRepository.updateCandidateStatus(id, 'cancelled');
    }

    await schedulingRepository.updateRequestStatus(requestId, 'cancelled');
    logger.info('SchedulingCancelled', { requestId, userId });
    const updated = await schedulingRepository.findRequestById(requestId);
    return updated ? toRequestDTOWithCandidates(updated) : toRequestDTO(request);
  },

  async getInviteLink(requestId: string, baseUrl?: string): Promise<string> {
    const request = await schedulingRepository.findRequestById(requestId);
    if (!request) throw new AppError('Scheduling request not found', 404);

    const base = baseUrl || process.env.APP_BASE_URL || 'https://v0-tennis-matchmaker-mvp.vercel.app';
    const path = `/play?invite=${request.inviteToken}`;
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
    return requests.map(toRequestDTOWithCandidates);
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
};
