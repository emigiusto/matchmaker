// scheduling.repository.ts
// Database operations for scheduling automation

import { logger } from '../../config/logger';
import { normalizePhoneToCanonical } from '../../shared/utils/phone.utils';
import { prisma } from '../../prisma';

/** Match phone digits - exact or suffix (handles 600972124 vs 34600972124 when one lacks country code). */
function phoneDigitsMatch(senderDigits: string, contactDigits: string): boolean {
  if (!contactDigits) return false;
  if (senderDigits === contactDigits) return true;
  if (senderDigits.endsWith(contactDigits) && contactDigits.length >= 8) return true;
  if (contactDigits.endsWith(senderDigits) && senderDigits.length >= 8) return true;
  return false;
}
import type {
  SchedulingCandidate,
  SchedulingRequestStatus,
  SchedulingCandidateStatus,
} from '@prisma/client';

export const schedulingRepository = {
  async getMaxPriorityOrder(schedulingRequestId: string): Promise<number> {
    const top = await prisma.schedulingCandidate.findFirst({
      where: { schedulingRequestId },
      select: { priorityOrder: true },
      orderBy: { priorityOrder: 'desc' },
    });
    return top ? top.priorityOrder + 1 : 0;
  },

  async addCandidates(
    schedulingRequestId: string,
    contactUserIds: string[]
  ): Promise<SchedulingCandidate[]> {
    if (contactUserIds.length === 0) return [];
    const startOrder = await this.getMaxPriorityOrder(schedulingRequestId);
    const creates = contactUserIds.map((contactUserId, i) =>
      prisma.schedulingCandidate.create({
        data: {
          schedulingRequestId,
          contactUserId,
          priorityOrder: startOrder + i,
          status: 'pending',
        },
      })
    );
    return Promise.all(creates);
  },

  async createCandidates(
    schedulingRequestId: string,
    contactUserIds: string[]
  ): Promise<SchedulingCandidate[]> {
    const creates = contactUserIds.map((contactUserId, index) =>
      prisma.schedulingCandidate.create({
        data: {
          schedulingRequestId,
          contactUserId,
          priorityOrder: index,
          status: 'pending',
        },
      })
    );
    return Promise.all(creates);
  },

  async findRequestById(id: string) {
    return prisma.schedulingRequest.findUnique({
      where: { id },
      include: {
        hostUser: true,
        hostPartner: true,
        candidates: { orderBy: { priorityOrder: 'asc' }, include: { contactUser: true } },
        match: { select: { whatsappGroupId: true } },
      },
    });
  },

  async findActiveRequestById(id: string) {
    return prisma.schedulingRequest.findFirst({
      where: { id, status: 'active' },
      include: {
        hostUser: true,
        hostPartner: true,
        candidates: { orderBy: { priorityOrder: 'asc' }, include: { contactUser: true } },
      },
    });
  },

  /** Active requests whose scheduled start time has passed */
  async findActivePastScheduledTime() {
    return prisma.schedulingRequest.findMany({
      where: { status: 'active', startTime: { lte: new Date() } },
      select: { id: true, date: true, startTime: true, additionalDates: true },
    });
  },

  async hasWaitingReplyCandidate(schedulingRequestId: string): Promise<boolean> {
    const c = await prisma.schedulingCandidate.findFirst({
      where: { schedulingRequestId, status: 'waiting_reply' },
    });
    return !!c;
  },

  async findFirstPendingCandidate(schedulingRequestId: string) {
    const list = await this.findPendingCandidatesOrdered(schedulingRequestId, 1);
    return list[0] ?? null;
  },

  async findPendingCandidatesOrdered(
    schedulingRequestId: string,
    limit: number
  ) {
    // Retried candidates (retryOrder set) first in retry order, then original pendings by priorityOrder
    const all = await prisma.schedulingCandidate.findMany({
      where: { schedulingRequestId, status: 'pending' },
      include: { contactUser: true },
    });
    all.sort((a, b) => {
      const aOrder = a.retryOrder ?? 999999;
      const bOrder = b.retryOrder ?? 999999;
      if (aOrder !== bOrder) return aOrder - bOrder;
      return a.priorityOrder - b.priorityOrder;
    });
    return all.slice(0, limit);
  },

  async countWaitingReplyCandidates(schedulingRequestId: string): Promise<number> {
    return prisma.schedulingCandidate.count({
      where: { schedulingRequestId, status: 'waiting_reply' },
    });
  },

  async getMaxRetryOrder(schedulingRequestId: string): Promise<number> {
    const top = await prisma.schedulingCandidate.findFirst({
      where: { schedulingRequestId, retryOrder: { not: null } },
      select: { retryOrder: true },
      orderBy: { retryOrder: 'desc' },
    });
    return top?.retryOrder ?? 0;
  },

  async retryCandidate(
    candidateId: string,
    retryOrder: number
  ) {
    return prisma.schedulingCandidate.update({
      where: { id: candidateId },
      data: { status: 'pending', retryOrder, contactedAt: null, responseAt: null },
    });
  },

  async findWaitingReplyCandidateByContactUserId(contactUserId: string) {
    return prisma.schedulingCandidate.findFirst({
      where: {
        contactUserId,
        status: 'waiting_reply',
      },
      include: {
        schedulingRequest: { include: { hostUser: true, hostPartner: true } },
        contactUser: true,
      },
    });
  },

  /**
   * Finds a candidate to record a response by PHONE (not userId).
   * Use this when multiple User records can share the same phone (e.g. different formats).
   * Matches the contact we actually sent the invite to.
   */
  async findCandidateToRecordResponseByPhone(phone: string) {
    const senderDigits = normalizePhoneToCanonical(phone.split('@')[0]);
    if (!senderDigits) return null;

    const candidates = await prisma.schedulingCandidate.findMany({
      where: { status: { in: ['waiting_reply', 'contacted', 'expired'] } },
      include: {
        schedulingRequest: { include: { hostUser: true, hostPartner: true } },
        contactUser: true,
      },
    });

    for (const c of candidates) {
      const contactDigits = normalizePhoneToCanonical(c.contactUser?.phone);
      if (!phoneDigitsMatch(senderDigits, contactDigits)) continue;
      if (c.status === 'waiting_reply' || c.status === 'contacted') return c;
      if (c.status === 'expired' && !c.responseAt && c.contactedAt) {
        const GRACE_MS = 5 * 60 * 1000;
        if (Date.now() - c.contactedAt.getTime() <= GRACE_MS) return c;
      }
    }

    return null;
  },

  /** Finds a candidate to record a response: waiting_reply, contacted (mid-retry), or recently expired with no response yet (late webhook) */
  async findCandidateToRecordResponseByContactUserId(contactUserId: string) {
    const waiting = await this.findWaitingReplyCandidateByContactUserId(contactUserId);
    if (waiting) return waiting;
    // contacted = invite just sent, waiting for waiting_reply (retry or race)
    const contacted = await prisma.schedulingCandidate.findFirst({
      where: { contactUserId, status: 'contacted' },
      include: {
        schedulingRequest: { include: { hostUser: true, hostPartner: true } },
        contactUser: true,
      },
    });
    if (contacted) return contacted;
    const GRACE_MS = 5 * 60 * 1000;
    const since = new Date(Date.now() - GRACE_MS);
    return prisma.schedulingCandidate.findFirst({
      where: {
        contactUserId,
        status: 'expired',
        responseAt: null,
        contactedAt: { gte: since },
      },
      include: {
        schedulingRequest: { include: { hostUser: true, hostPartner: true } },
        contactUser: true,
      },
    });
  },

  async findWaitingReplyCandidatesToExpire() {
    const candidates = await prisma.schedulingCandidate.findMany({
      where: { status: 'waiting_reply' },
      include: {
        schedulingRequest: { include: { hostUser: true } },
        contactUser: true,
      },
    });
    const now = Date.now();
    return candidates.filter((c) => {
      if (!c.contactedAt) return false;
      const mins = c.schedulingRequest.responseWindowMinutes;
      // Treat 0 or invalid as 20 sec (0.333 min) for testing - was truncated by old Int column
      const windowMinutes = mins && mins > 0 ? mins : 1 / 3;
      const windowMs = windowMinutes * 60 * 1000;
      return now - c.contactedAt.getTime() > windowMs;
    });
  },

  async findRequestByInviteToken(token: string) {
    return prisma.schedulingRequest.findUnique({
      where: { inviteToken: token },
      include: {
        hostUser: true,
        hostPartner: true,
        candidates: { orderBy: { priorityOrder: 'asc' }, include: { contactUser: true } },
        match: { select: { whatsappGroupId: true } },
      },
    });
  },

  async countActiveByHostUserId(hostUserId: string): Promise<number> {
    return prisma.schedulingRequest.count({
      where: { hostUserId, status: 'active' },
    });
  },

  async findIncomingCandidatesByUserId(userId: string) {
    return prisma.schedulingCandidate.findMany({
      where: {
        contactUserId: userId,
        schedulingRequest: { status: 'active' },
      },
      include: {
        schedulingRequest: {
          include: { hostUser: true, hostPartner: true },
        },
        contactUser: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  },

  async updateCandidateStatus(
    id: string,
    status: SchedulingCandidateStatus,
    responseAt?: Date
  ) {
    return prisma.schedulingCandidate.update({
      where: { id },
      data: { status, responseAt: responseAt ?? undefined },
    });
  },

  async updateRequestStatus(
    id: string,
    status: SchedulingRequestStatus
  ) {
    return prisma.schedulingRequest.update({
      where: { id },
      data: { status },
    });
  },

  async updateRequestAndCandidateInTx(
    requestId: string,
    requestUpdates: { status?: SchedulingRequestStatus; currentCandidateIndex?: number },
    candidateId: string,
    candidateUpdates: { status: SchedulingCandidateStatus; contactedAt?: Date; responseAt?: Date }
  ) {
    return prisma.$transaction(async (tx) => {
      if (Object.keys(requestUpdates).length > 0) {
        await tx.schedulingRequest.update({
          where: { id: requestId },
          data: requestUpdates,
        });
      }
      return tx.schedulingCandidate.update({
        where: { id: candidateId },
        data: candidateUpdates,
      });
    });
  },

  async countPendingCandidates(schedulingRequestId: string): Promise<number> {
    return prisma.schedulingCandidate.count({
      where: {
        schedulingRequestId,
        status: 'pending',
      },
    });
  },

  async findUserByPhone(phone: string) {
    const cleaned = phone.split('@')[0].trim();
    const digits = cleaned.replace(/\D/g, '');
    if (!digits) return null;
    const users = await prisma.user.findMany({ where: { phone: { not: null } } });
    return users.find((u) => u.phone && u.phone.replace(/\D/g, '') === digits) ?? null;
  },

  async updateCandidateFromWaitingReply(
    id: string,
    newStatus: 'accepted' | 'declined',
    responseAt: Date
  ): Promise<boolean> {
    const result = await prisma.schedulingCandidate.updateMany({
      where: { id, status: 'waiting_reply' },
      data: { status: newStatus, responseAt },
    });
    return result.count > 0;
  },
};
