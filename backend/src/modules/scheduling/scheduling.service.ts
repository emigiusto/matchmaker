// scheduling.service.ts
// Core automation logic for sequential match scheduling via WhatsApp

import crypto from 'crypto';
import { prisma } from '../../prisma';
import { AppError } from '../../shared/errors/AppError';
import { logger } from '../../config/logger';
import { schedulingRepository } from './scheduling.repository';
import { whatsappService } from '../whatsapp/whatsapp.service';
import { createMatch } from '../matches/matches.service';
import type {
  CreateSchedulingRequestInput,
  SchedulingRequestDTO,
  SchedulingCandidateDTO,
} from './scheduling.types';
import { MAX_ACTIVE_SCHEDULING_REQUESTS, RESPONSE_WINDOW_OPTIONS } from './scheduling.types';

const ACCEPT_PATTERNS = /^(yes|y|accept|👍)$|👍/i;
const DECLINE_PATTERNS = /^(no|n|decline)$/i;

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
  inviteToken: string;
  status: string;
  currentCandidateIndex: number;
  matchId: string | null;
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
    inviteToken: r.inviteToken,
    status: r.status as SchedulingRequestDTO['status'],
    currentCandidateIndex: r.currentCandidateIndex,
    matchId: r.matchId,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  };
}

function toRequestDTOWithCandidates(
  r: RequestRow & { candidates?: Array<{ id: string; schedulingRequestId: string; contactUserId: string; contactUser?: { name: string | null } | null; priorityOrder: number; status: string; contactedAt: Date | null; responseAt: Date | null; createdAt: Date; updatedAt: Date }> }
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

function toCandidateDTO(c: { id: string; schedulingRequestId: string; contactUserId: string; priorityOrder: number; status: string; contactedAt: Date | null; responseAt: Date | null; createdAt: Date; updatedAt: Date }): SchedulingCandidateDTO {
  return {
    id: c.id,
    schedulingRequestId: c.schedulingRequestId,
    contactUserId: c.contactUserId,
    priorityOrder: c.priorityOrder,
    status: c.status as SchedulingCandidateDTO['status'],
    contactedAt: c.contactedAt?.toISOString() ?? null,
    responseAt: c.responseAt?.toISOString() ?? null,
    createdAt: c.createdAt.toISOString(),
    updatedAt: c.updatedAt.toISOString(),
  };
}

function formatInviteMessage(hostName: string, sportType: string, format: string, dateStr: string, timeStr: string, location: string): string {
  const formatLabel = format === 'doubles' ? 'doubles' : 'singles';
  return `${hostName} wants to play ${sportType} ${formatLabel} with you.\n\n${dateStr} ${timeStr}\nLocation: ${location}\n\nReply YES to accept\nReply NO to decline`;
}

function formatMatchDetailsMessage(sportType: string, format: string, dateStr: string, timeStr: string, location: string): string {
  const formatLabel = format === 'doubles' ? 'Doubles' : 'Singles';
  return `Match confirmed!\n\n${sportType} · ${formatLabel}\n${dateStr} ${timeStr}\nLocation: ${location}`;
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

    await this.contactNextCandidate(requestId);
    const updated = await schedulingRepository.findRequestById(requestId);
    return updated ? toRequestDTOWithCandidates(updated) : null;
  },

  async contactNextCandidate(requestId: string): Promise<void> {
    const request = await schedulingRepository.findActiveRequestById(requestId);
    if (!request) return;

    const candidate = await schedulingRepository.findFirstPendingCandidate(requestId);
    if (!candidate) {
      const pendingCount = await schedulingRepository.countPendingCandidates(requestId);
      if (pendingCount === 0) {
        await schedulingRepository.updateRequestStatus(requestId, 'expired');
        logger.info('SchedulingExpired', { requestId, reason: 'all_candidates_exhausted' });
      }
      return;
    }

    const contactUser = candidate.contactUser;
    const phone = contactUser?.phone;
    if (!phone) {
      logger.warn('InviteSkipped', { candidateId: candidate.id, reason: 'no_phone' });
      await schedulingRepository.updateCandidateStatus(candidate.id, 'expired');
      await this.contactNextCandidate(requestId);
      return;
    }

    const hostName = request.hostUser?.name || 'Someone';
    const dateStr = request.date.toLocaleDateString('en-US', { weekday: 'long' });
    const timeStr = `${request.startTime.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })} - ${request.endTime.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}`;
    const format = (request as RequestRow).format || 'singles';
    const message = formatInviteMessage(hostName, request.sportType, format, dateStr, timeStr, request.locationText);

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

    const result = await whatsappService.sendInviteMessage(phone, message);

    await schedulingRepository.updateCandidateStatus(candidate.id, 'waiting_reply');

    if (!result.success) {
      logger.error('InviteSendFailed', { candidateId: candidate.id, error: result.error });
      await schedulingRepository.updateCandidateStatus(candidate.id, 'expired');
      await this.contactNextCandidate(requestId);
      return;
    }

    logger.info('InviteSent', { requestId, candidateId: candidate.id, contactUserId: candidate.contactUserId });
  },

  async handleCandidateResponse(senderPhoneNumber: string, messageText: string): Promise<{ processed: boolean }> {
    const user = await schedulingRepository.findUserByPhone(senderPhoneNumber);
    if (!user) return { processed: false };

    const candidate = await schedulingRepository.findWaitingReplyCandidateByContactUserId(user.id);
    if (!candidate) return { processed: false };

    const text = (messageText || '').trim();
    const isAccept = ACCEPT_PATTERNS.test(text);
    const isDecline = DECLINE_PATTERNS.test(text);

    if (!isAccept && !isDecline) return { processed: false };

    const request = candidate.schedulingRequest;
    if (request.status !== 'active') {
      logger.warn('InviteIgnored', { reason: 'request_not_active', requestId: request.id });
      return { processed: true };
    }

    const now = new Date();

    if (isAccept) {
      const updated = await schedulingRepository.updateCandidateFromWaitingReply(candidate.id, 'accepted', now);
      if (!updated) {
        logger.warn('InviteDuplicateResponse', { candidateId: candidate.id, action: 'accept' });
        return { processed: true };
      }
      await prisma.schedulingRequest.update({
        where: { id: request.id },
        data: { status: 'completed' },
      });
      logger.info('InviteAccepted', { requestId: request.id, candidateId: candidate.id });
      await this.completeScheduling(request.id, candidate.id);
      return { processed: true };
    }

    if (isDecline) {
      const updated = await schedulingRepository.updateCandidateFromWaitingReply(candidate.id, 'declined', now);
      if (!updated) {
        logger.warn('InviteDuplicateResponse', { candidateId: candidate.id, action: 'decline' });
        return { processed: true };
      }
      logger.info('InviteDeclined', { requestId: request.id, candidateId: candidate.id });
      await this.contactNextCandidate(request.id);
      return { processed: true };
    }

    return { processed: false };
  },

  async expireCandidate(candidateId: string): Promise<void> {
    const candidate = await prisma.schedulingCandidate.findUnique({
      where: { id: candidateId },
      include: { schedulingRequest: true },
    });
    if (!candidate || candidate.status !== 'waiting_reply') return;

    await schedulingRepository.updateCandidateStatus(candidateId, 'expired');
    logger.info('InviteExpired', { requestId: candidate.schedulingRequestId, candidateId });
    await this.contactNextCandidate(candidate.schedulingRequestId);
  },

  async expireWaitingCandidates(): Promise<number> {
    const candidates = await schedulingRepository.findWaitingReplyCandidatesToExpire();
    for (const c of candidates) {
      await this.expireCandidate(c.id);
    }
    return candidates.length;
  },

  async completeScheduling(requestId: string, acceptedCandidateId: string): Promise<void> {
    const request = await prisma.schedulingRequest.findUnique({
      where: { id: requestId },
      include: {
        hostUser: true,
        hostPartner: true,
        candidates: { where: { id: acceptedCandidateId }, include: { contactUser: true } },
      },
    });

    if (!request || request.status !== 'completed') return;

    const candidate = request.candidates[0];
    if (!candidate) return;

    const hostUser = request.hostUser;
    const opponentUser = candidate.contactUser;
    if (!hostUser || !opponentUser) return;

    const scheduledAt = new Date(request.startTime);
    const matchType = request.matchType === 'practice' ? 'practice' : 'competitive';

    const availability = await prisma.availability.create({
      data: {
        userId: hostUser.id,
        date: request.date,
        startTime: request.startTime,
        endTime: request.endTime,
        locationText: request.locationText,
        status: 'matched',
      },
    });

    const match = await createMatch({
      hostUserId: hostUser.id,
      opponentUserId: opponentUser.id,
      scheduledAt: scheduledAt.toISOString(),
      availabilityId: availability.id,
      type: matchType,
      hostPartnerUserId: request.hostPartnerUserId ?? undefined,
      opponentPartnerUserId: undefined,
    });

    await prisma.schedulingRequest.update({
      where: { id: requestId },
      data: { matchId: match.id },
    });

    logger.info('MatchCreated', { matchId: match.id, requestId });

    const format = (request as RequestRow).format || 'singles';

    const participantPhones: string[] = [];
    if (hostUser.phone) participantPhones.push(hostUser.phone);
    if (format === 'doubles' && request.hostPartner?.phone) participantPhones.push(request.hostPartner.phone);
    if (opponentUser.phone) participantPhones.push(opponentUser.phone);
    if (participantPhones.length >= 2) {
      const dayStr = request.date.toLocaleDateString('en-US', { weekday: 'long' });
      const timeStr = request.startTime.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
      const groupName = `${dayStr} ${timeStr} - ${request.locationText}`;
      const botPhone = process.env.WHATSAPP_BOT_NUMBER || process.env.WHAPI_BOT_PHONE;

      const groupResult = await whatsappService.createMatchGroup({
        participantPhones,
        groupName,
        botPhone: botPhone || undefined,
      });

      if (groupResult.success && groupResult.groupId) {
        logger.info('WhatsappGroupCreated', { groupId: groupResult.groupId, matchId: match.id, groupName });
        const detailsMessage = formatMatchDetailsMessage(request.sportType, format, dayStr, timeStr, request.locationText);
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

  async cancelSchedulingRequest(requestId: string, userId: string): Promise<SchedulingRequestDTO> {
    const request = await schedulingRepository.findRequestById(requestId);
    if (!request) throw new AppError('Scheduling request not found', 404);
    if (request.hostUserId !== userId) throw new AppError('Only the host can cancel', 403);
    if (request.status === 'cancelled') return toRequestDTOWithCandidates(request);
    if (request.status === 'completed') throw new AppError('Cannot cancel a completed match', 400);

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
      include: { hostUser: true, hostPartner: true, candidates: { orderBy: { priorityOrder: 'asc' }, include: { contactUser: true } } },
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
      include: { hostUser: true, hostPartner: true, candidates: { orderBy: { priorityOrder: 'asc' }, include: { contactUser: true } } },
      orderBy: { createdAt: 'desc' },
    });
    return requests.map(toRequestDTOWithCandidates);
  },
};
