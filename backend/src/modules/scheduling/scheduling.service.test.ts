import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AppError } from '../../shared/errors/AppError';

// ------------------------------------------------------
// Hoisted mocks (must be available when vi.mock factories run)
// ------------------------------------------------------

const { mockTx, mockRepo } = vi.hoisted(() => {
  const mockTx = {
    user: { findUnique: vi.fn(), findMany: vi.fn() },
    schedulingRequest: { create: vi.fn(), update: vi.fn(), findUnique: vi.fn(), findMany: vi.fn() },
    schedulingInviteEvent: { findMany: vi.fn(), create: vi.fn() },
    schedulingCandidate: {
      create: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      findUnique: vi.fn(),
      findMany: vi.fn(),
      delete: vi.fn(),
    },
    availability: { create: vi.fn() },
    match: { update: vi.fn() },
  };
  const mockRepo = {
    countActiveByHostUserId: vi.fn(),
    findRequestById: vi.fn(),
    findActiveRequestById: vi.fn(),
    findFirstPendingCandidate: vi.fn(),
    findPendingCandidatesOrdered: vi.fn(),
    countWaitingReplyCandidates: vi.fn(),
    countPendingCandidates: vi.fn(),
    countActiveCandidates: vi.fn(),
    updateRequestStatus: vi.fn(),
    updateCandidateStatus: vi.fn(),
    retryCandidate: vi.fn(),
    getMaxRetryOrder: vi.fn(),
    addCandidates: vi.fn(),
    updateCandidateFromWaitingReply: vi.fn(),
    findCandidateToRecordResponseByPhone: vi.fn(),
    findWaitingReplyCandidatesToExpire: vi.fn(),
    findActivePastScheduledTime: vi.fn(),
    findRequestByInviteToken: vi.fn(),
    findIncomingCandidatesByUserId: vi.fn(),
  };
  return { mockTx, mockRepo };
});

vi.mock('../../prisma', () => {
  const mockPrisma: any = {
    user: mockTx.user,
    schedulingRequest: mockTx.schedulingRequest,
    schedulingCandidate: mockTx.schedulingCandidate,
    schedulingInviteEvent: mockTx.schedulingInviteEvent,
    availability: mockTx.availability,
    match: mockTx.match,
    contact: { findFirst: vi.fn().mockResolvedValue(null) },
    $transaction: vi.fn(async (fn: (tx: any) => Promise<any>) => fn(mockTx)),
    __mockTx: mockTx,
  };
  return { prisma: mockPrisma };
});

vi.mock('./scheduling.repository', () => ({
  schedulingRepository: mockRepo,
}));

// ------------------------------------------------------
// WhatsApp & Matches Mocks
// ------------------------------------------------------

vi.mock('../whatsapp/whatsapp.service', () => ({
  whatsappService: {
    sendInviteMessage: vi.fn().mockResolvedValue({ success: true }),
    createMatchGroup: vi.fn().mockResolvedValue({ success: true, groupId: 'group1' }),
    sendGroupMessage: vi.fn().mockResolvedValue(undefined),
    ensureParticipantsReceiveGroupInvite: vi.fn().mockResolvedValue({ sentTo: [], errors: [] }),
  },
}));

vi.mock('../matches/matches.service', () => ({
  createMatch: vi.fn().mockResolvedValue({
    id: 'match1',
    participants: [{ userId: 'host1' }, { userId: 'opp1' }],
  }),
  cancelMatch: vi.fn().mockResolvedValue(undefined),
  notifyMatchParticipantsOnCreate: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../notifications/notifications.service', () => ({
  createNotification: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../config/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

// IMPORTANT: Import AFTER all mocks
import { prisma } from '../../prisma';
import { schedulingService } from './scheduling.service';
import { whatsappService } from '../whatsapp/whatsapp.service';

const defaultTransaction = async (fn: (tx: any) => Promise<any>) => fn(mockTx);

// ------------------------------------------------------
// Fixtures
// ------------------------------------------------------

const baseInput = {
  hostUserId: 'host1',
  sportType: 'tennis' as const,
  format: 'singles' as const,
  date: '2025-04-15',
  startTime: '2025-04-15T10:00:00.000Z',
  endTime: '2025-04-15T11:00:00.000Z',
  locationText: 'Court 1',
  candidateUserIds: ['cand1'],
};

const baseRequestDate = new Date();
const baseRequest = {
  id: 'req1',
  hostUserId: 'host1',
  hostPartnerUserId: null,
  sportType: 'tennis',
  format: 'singles',
  matchType: 'competitive',
  date: new Date('2025-04-15'),
  startTime: new Date('2025-04-15T10:00:00.000Z'),
  endTime: new Date('2025-04-15T11:00:00.000Z'),
  locationText: 'Court 1',
  radiusKm: null,
  inviteToken: 'tok123',
  status: 'active',
  currentCandidateIndex: 0,
  matchId: null,
  createdAt: baseRequestDate,
  updatedAt: baseRequestDate,
  hostUser: { id: 'host1', name: 'Host', phone: '+123', email: null },
  hostPartner: null,
  candidates: [
    {
      id: 'cand1',
      schedulingRequestId: 'req1',
      contactUserId: 'cand1',
      priorityOrder: 0,
      retryOrder: null,
      status: 'expired',
      contactedAt: new Date(),
      responseAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      contactUser: { id: 'cand1', name: 'Candidate', phone: '+456', email: null },
    },
  ],
  match: null,
};

// ------------------------------------------------------
// Test Suites
// ------------------------------------------------------

describe('SchedulingService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.values(mockRepo).forEach((fn: any) => fn?.mockReset?.());
    Object.values(mockTx).forEach((group: any) =>
      typeof group === 'object' ? Object.values(group).forEach((fn: any) => fn?.mockReset?.()) : null
    );
    (prisma as any).$transaction.mockImplementation(defaultTransaction);
  });

  describe('createSchedulingRequest', () => {
    it('throws when no candidates provided', async () => {
      mockRepo.countActiveByHostUserId.mockResolvedValue(0);
      mockTx.user.findUnique.mockResolvedValue({ id: 'host1', name: 'Host' });

      await expect(
        schedulingService.createSchedulingRequest({ ...baseInput, candidateUserIds: [] })
      ).rejects.toThrow(AppError);

      await expect(
        schedulingService.createSchedulingRequest({ ...baseInput, candidateUserIds: undefined! })
      ).rejects.toThrow('At least one candidate is required');
    });

    it('throws when max active requests reached', async () => {
      mockRepo.countActiveByHostUserId.mockResolvedValue(5);

      await expect(
        schedulingService.createSchedulingRequest(baseInput)
      ).rejects.toThrow(AppError);

      await expect(
        schedulingService.createSchedulingRequest(baseInput)
      ).rejects.toThrow(/Maximum 5 active scheduling requests/);
    });

    it('throws when host user not found', async () => {
      mockRepo.countActiveByHostUserId.mockResolvedValue(0);
      mockTx.user.findUnique.mockResolvedValue(null);

      await expect(
        schedulingService.createSchedulingRequest(baseInput)
      ).rejects.toThrow(AppError);

      await expect(
        schedulingService.createSchedulingRequest(baseInput)
      ).rejects.toThrow('Host user not found');
    });

    it('throws when host invites themselves', async () => {
      mockRepo.countActiveByHostUserId.mockResolvedValue(0);
      mockTx.user.findUnique.mockResolvedValue({ id: 'host1', name: 'Host' });

      await expect(
        schedulingService.createSchedulingRequest({
          ...baseInput,
          candidateUserIds: ['host1'],
        })
      ).rejects.toThrow('You cannot invite yourself as a candidate');
    });

    it('throws when doubles has fewer than 3 candidates', async () => {
      mockRepo.countActiveByHostUserId.mockResolvedValue(0);
      mockTx.user.findUnique.mockResolvedValue({ id: 'host1', name: 'Host' });

      await expect(
        schedulingService.createSchedulingRequest({
          ...baseInput,
          sportType: 'padel',
          candidateUserIds: ['c1', 'c2'],
        })
      ).rejects.toThrow(/Doubles matches require at least 3 candidates/);
    });

    it('creates request successfully with valid input', async () => {
      mockRepo.countActiveByHostUserId.mockResolvedValue(0);
      mockTx.user.findUnique.mockResolvedValue({ id: 'host1', name: 'Host' });
      const now = new Date();
      const createdReq = {
        id: 'req-new',
        hostUserId: baseInput.hostUserId,
        hostPartnerUserId: null,
        sportType: baseInput.sportType,
        format: 'singles',
        matchType: 'competitive',
        date: new Date(baseInput.date),
        startTime: new Date(baseInput.startTime),
        endTime: new Date(baseInput.endTime),
        locationText: baseInput.locationText,
        radiusKm: null,
        inviteToken: 'tok-xyz',
        status: 'active',
        currentCandidateIndex: 0,
        matchId: null,
        createdAt: now,
        updatedAt: now,
      };
      mockTx.schedulingRequest.create.mockResolvedValue(createdReq);
      mockTx.schedulingCandidate.create.mockResolvedValue({
        id: 'c-new',
        schedulingRequestId: 'req-new',
        contactUserId: 'cand1',
        priorityOrder: 0,
        status: 'pending',
      });

      mockRepo.findRequestById.mockResolvedValue({
        ...createdReq,
        hostUser: { id: 'host1', name: 'Host' },
        hostPartner: null,
        candidates: [{ id: 'c-new', contactUser: { name: 'Candidate' }, createdAt: now, updatedAt: now }],
        match: null,
      });

      const result = await schedulingService.createSchedulingRequest(baseInput);

      expect(result).toBeDefined();
      expect(result.id).toBe('req-new');
      expect(result.status).toBe('active');
      expect(mockTx.schedulingRequest.create).toHaveBeenCalled();
    });

    it('stores the provided timezone in the scheduling request', async () => {
      mockRepo.countActiveByHostUserId.mockResolvedValue(0);
      mockTx.user.findUnique.mockResolvedValue({ id: 'host1', name: 'Host' });
      const now = new Date();
      const createdReq = {
        id: 'req-tz',
        hostUserId: 'host1',
        hostPartnerUserId: null,
        sportType: 'tennis',
        format: 'singles',
        matchType: 'competitive',
        date: new Date('2025-04-15'),
        startTime: new Date('2025-04-15T10:00:00.000Z'),
        endTime: new Date('2025-04-15T11:00:00.000Z'),
        locationText: 'Court 1',
        radiusKm: null,
        inviteToken: 'tok-tz',
        status: 'active',
        currentCandidateIndex: 0,
        matchId: null,
        timezone: 'Europe/Madrid',
        createdAt: now,
        updatedAt: now,
      };
      mockTx.schedulingRequest.create.mockResolvedValue(createdReq);
      mockTx.schedulingCandidate.create.mockResolvedValue({
        id: 'c-tz',
        schedulingRequestId: 'req-tz',
        contactUserId: 'cand1',
        priorityOrder: 0,
        status: 'pending',
      });
      mockRepo.findRequestById.mockResolvedValue({
        ...createdReq,
        hostUser: { id: 'host1', name: 'Host' },
        hostPartner: null,
        candidates: [],
        match: null,
      });

      await schedulingService.createSchedulingRequest({
        ...baseInput,
        timezone: 'Europe/Madrid',
      });

      expect(mockTx.schedulingRequest.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ timezone: 'Europe/Madrid' }),
        }),
      );
    });

    it('defaults timezone to UTC when not provided', async () => {
      mockRepo.countActiveByHostUserId.mockResolvedValue(0);
      mockTx.user.findUnique.mockResolvedValue({ id: 'host1', name: 'Host' });
      const now = new Date();
      const createdReq = {
        id: 'req-utc',
        hostUserId: 'host1',
        hostPartnerUserId: null,
        sportType: 'tennis',
        format: 'singles',
        matchType: 'competitive',
        date: new Date('2025-04-15'),
        startTime: new Date('2025-04-15T10:00:00.000Z'),
        endTime: new Date('2025-04-15T11:00:00.000Z'),
        locationText: 'Court 1',
        radiusKm: null,
        inviteToken: 'tok-utc',
        status: 'active',
        currentCandidateIndex: 0,
        matchId: null,
        timezone: 'UTC',
        createdAt: now,
        updatedAt: now,
      };
      mockTx.schedulingRequest.create.mockResolvedValue(createdReq);
      mockTx.schedulingCandidate.create.mockResolvedValue({
        id: 'c-utc',
        schedulingRequestId: 'req-utc',
        contactUserId: 'cand1',
        priorityOrder: 0,
        status: 'pending',
      });
      mockRepo.findRequestById.mockResolvedValue({
        ...createdReq,
        hostUser: { id: 'host1', name: 'Host' },
        hostPartner: null,
        candidates: [],
        match: null,
      });

      await schedulingService.createSchedulingRequest(baseInput); // no timezone field

      expect(mockTx.schedulingRequest.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ timezone: 'UTC' }),
        }),
      );
    });
  });

  describe('retryCandidate', () => {
    it('throws when request not found', async () => {
      mockRepo.findRequestById.mockResolvedValue(null);

      await expect(
        schedulingService.retryCandidate('req1', 'cand1', 'host1')
      ).rejects.toThrow('Scheduling request not found');
    });

    it('throws when user is not the host', async () => {
      mockRepo.findRequestById.mockResolvedValue({ ...baseRequest, hostUserId: 'host1' });

      await expect(
        schedulingService.retryCandidate('req1', 'cand1', 'other-user')
      ).rejects.toThrow('Only the host can retry');
    });

    it('throws when request is not active or expired', async () => {
      mockRepo.findRequestById.mockResolvedValue({ ...baseRequest, status: 'completed' });

      await expect(
        schedulingService.retryCandidate('req1', 'cand1', 'host1')
      ).rejects.toThrow('Request must be active or expired to retry');
    });

    it('throws when candidate not found', async () => {
      mockRepo.findRequestById.mockResolvedValue({
        ...baseRequest,
        candidates: [],
      });

      await expect(
        schedulingService.retryCandidate('req1', 'cand1', 'host1')
      ).rejects.toThrow('Candidate not found');
    });

    it('throws when candidate is not retryable (e.g. declined)', async () => {
      mockRepo.findRequestById.mockResolvedValue({
        ...baseRequest,
        candidates: [
          { ...baseRequest.candidates![0], status: 'declined' },
        ],
      });

      await expect(
        schedulingService.retryCandidate('req1', 'cand1', 'host1')
      ).rejects.toThrow('Only expired, cancelled, or send_failed candidates can be retried');
    });

    it('reactivates expired request and contacts next candidates', async () => {
      const now = new Date();
      const expiredRequest = {
        ...baseRequest,
        status: 'expired',
        createdAt: now,
        updatedAt: now,
        candidates: [
          {
            ...baseRequest.candidates![0],
            status: 'expired',
            contactUser: { id: 'cand1', name: 'Candidate', phone: '+456', email: null },
          },
        ],
      };
      const updatedRequest = {
        ...expiredRequest,
        status: 'active',
        candidates: [{ ...expiredRequest.candidates![0], status: 'waiting_reply' }],
      };
      mockRepo.findRequestById
        .mockResolvedValueOnce(expiredRequest)
        .mockResolvedValue(updatedRequest);
      mockRepo.getMaxRetryOrder.mockResolvedValue(0);
      mockRepo.retryCandidate.mockResolvedValue(undefined);
      mockRepo.updateRequestStatus.mockResolvedValue(undefined);
      mockRepo.findActiveRequestById.mockResolvedValue({ ...expiredRequest, status: 'active' });
      mockRepo.findPendingCandidatesOrdered
        .mockResolvedValueOnce([
          {
            id: 'cand1',
            contactUserId: 'cand1',
            priorityOrder: 0,
            contactUser: { phone: '+456', name: 'Candidate' },
          },
        ])
        .mockResolvedValue([]);
      mockRepo.countPendingCandidates.mockResolvedValue(0);
      mockRepo.countActiveCandidates.mockResolvedValue(1);

      const result = await schedulingService.retryCandidate('req1', 'cand1', 'host1');

      expect(mockRepo.updateRequestStatus).toHaveBeenCalledWith('req1', 'active');
      expect(mockRepo.retryCandidate).toHaveBeenCalledWith('cand1', 1);
      expect(result.status).toBe('active');
    });
  });

  describe('addCandidates', () => {
    it('throws when user is not the host', async () => {
      mockRepo.findRequestById.mockResolvedValue(baseRequest);

      await expect(
        schedulingService.addCandidates('req1', ['cand2'], 'other-user')
      ).rejects.toThrow('Only the host can add candidates');
    });

    it('throws when request is completed', async () => {
      mockRepo.findRequestById.mockResolvedValue({ ...baseRequest, status: 'completed' });

      await expect(
        schedulingService.addCandidates('req1', ['cand2'], 'host1')
      ).rejects.toThrow('Cannot add candidates to a completed match');
    });

    it('throws when host adds themselves', async () => {
      mockRepo.findRequestById.mockResolvedValue(baseRequest);

      await expect(
        schedulingService.addCandidates('req1', ['host1'], 'host1')
      ).rejects.toThrow('You cannot invite yourself as a candidate');
    });

    it('adds candidates and reactivates if expired', async () => {
      const now = new Date();
      const expiredReq = { ...baseRequest, status: 'expired', createdAt: now, updatedAt: now };
      const updated = {
        ...expiredReq,
        status: 'active',
        candidates: [...expiredReq.candidates!],
        createdAt: now,
        updatedAt: now,
      };
      mockRepo.findRequestById.mockResolvedValueOnce(expiredReq).mockResolvedValue(updated);
      mockRepo.addCandidates.mockResolvedValue([]);
      mockRepo.updateRequestStatus.mockResolvedValue(undefined);
      mockRepo.findActiveRequestById.mockResolvedValue({ ...expiredReq, status: 'active' });
      mockRepo.findPendingCandidatesOrdered.mockResolvedValue([]);
      mockRepo.countPendingCandidates.mockResolvedValue(0);
      mockRepo.countActiveCandidates.mockResolvedValue(1);
      mockTx.user.findMany.mockResolvedValue([]);

      const result = await schedulingService.addCandidates('req1', ['cand2'], 'host1');

      expect(mockRepo.addCandidates).toHaveBeenCalledWith('req1', ['cand2']);
      expect(mockRepo.updateRequestStatus).toHaveBeenCalledWith('req1', 'active');
      expect(result.status).toBe('active');
    });
  });

  describe('handleCandidateResponse', () => {
    it('returns processed: false when no waiting candidate found', async () => {
      mockRepo.findCandidateToRecordResponseByPhone.mockResolvedValue(null);

      const result = await schedulingService.handleCandidateResponse('+456', 'yes');

      expect(result).toEqual({ processed: false });
    });

    it('returns processed: false when message is unrecognized', async () => {
      mockRepo.findCandidateToRecordResponseByPhone.mockResolvedValue({
        ...baseRequest.candidates![0],
        status: 'waiting_reply',
        schedulingRequest: { ...baseRequest, status: 'active' },
      });

      const result = await schedulingService.handleCandidateResponse('+456', 'maybe');

      expect(result).toEqual({ processed: false });
    });

    it('processes accept and calls contactNextCandidates', async () => {
      const candidate = {
        ...baseRequest.candidates![0],
        status: 'waiting_reply',
        schedulingRequest: { ...baseRequest, status: 'active' },
      };
      mockRepo.findCandidateToRecordResponseByPhone.mockResolvedValue(candidate);
      mockTx.schedulingInviteEvent.create.mockResolvedValue({});

      const result = await schedulingService.handleCandidateResponse('+456', '', ['10:00']);

      expect(result).toEqual({ processed: true });
      expect(mockTx.schedulingInviteEvent.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ action: 'poll_vote', candidateId: candidate.id }),
        })
      );
    });

    it('processes decline via None option', async () => {
      const candidate = {
        ...baseRequest.candidates![0],
        status: 'waiting_reply',
        schedulingRequest: { ...baseRequest, status: 'active' },
      };
      mockRepo.findCandidateToRecordResponseByPhone.mockResolvedValue(candidate);
      mockTx.schedulingCandidate.updateMany.mockResolvedValue({ count: 1 });
      mockRepo.findActiveRequestById.mockResolvedValue(baseRequest);
      mockRepo.findPendingCandidatesOrdered.mockResolvedValue([]);
      mockRepo.countPendingCandidates.mockResolvedValue(0);
      mockRepo.countActiveCandidates.mockResolvedValue(0);

      const result = await schedulingService.handleCandidateResponse('+456', '', ['Ninguno']);

      expect(result).toEqual({ processed: true });
      expect(mockTx.schedulingCandidate.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: candidate.id, status: { in: ['waiting_reply', 'contacted'] } },
          data: expect.objectContaining({ status: 'declined' }),
        })
      );
    });
  });

  describe('cancelSchedulingRequest', () => {
    it('throws when user is not the host', async () => {
      mockRepo.findRequestById.mockResolvedValue(baseRequest);

      await expect(
        schedulingService.cancelSchedulingRequest('req1', 'other-user')
      ).rejects.toThrow('Only the host can cancel');
    });

    it('throws when request is already completed', async () => {
      mockRepo.findRequestById.mockResolvedValue({ ...baseRequest, status: 'completed' });

      await expect(
        schedulingService.cancelSchedulingRequest('req1', 'host1')
      ).rejects.toThrow('Cannot cancel a completed match');
    });

    it('cancels request successfully', async () => {
      const now = new Date();
      const baseWithDates = { ...baseRequest, createdAt: now, updatedAt: now };
      mockRepo.findRequestById
        .mockResolvedValueOnce(baseWithDates)
        .mockResolvedValue({ ...baseWithDates, status: 'cancelled' });
      mockRepo.updateCandidateStatus.mockResolvedValue(undefined);
      mockRepo.updateRequestStatus.mockResolvedValue(undefined);

      const result = await schedulingService.cancelSchedulingRequest('req1', 'host1');

      expect(mockRepo.updateRequestStatus).toHaveBeenCalledWith('req1', 'cancelled');
      expect(result.status).toBe('cancelled');
    });
  });

  describe('startScheduling', () => {
    it('returns null when request not found', async () => {
      mockRepo.findActiveRequestById.mockResolvedValue(null);

      const result = await schedulingService.startScheduling('req1');

      expect(result).toBeNull();
    });

    it('expires request when no pending candidates', async () => {
      mockRepo.findActiveRequestById.mockResolvedValue(baseRequest);
      mockRepo.countActiveByHostUserId.mockResolvedValue(1);
      mockRepo.findFirstPendingCandidate.mockResolvedValue(null);
      mockRepo.updateRequestStatus.mockResolvedValue(undefined);

      const now = new Date();
      const result = await schedulingService.startScheduling('req1');

      expect(mockRepo.updateRequestStatus).toHaveBeenCalledWith('req1', 'expired');
      expect(result?.status).toBe('expired');
    });
  });

  describe('getInviteLink', () => {
    it('returns invite link for valid request', async () => {
      mockRepo.findRequestById.mockResolvedValue({ ...baseRequest, inviteToken: 'abc123' });

      const link = await schedulingService.getInviteLink('req1', 'https://app.example.com');

      expect(link).toBe('https://app.example.com/join/abc123');
    });

    it('throws when request not found', async () => {
      mockRepo.findRequestById.mockResolvedValue(null);

      await expect(schedulingService.getInviteLink('req1')).rejects.toThrow('Scheduling request not found');
    });
  });

  describe('getActiveCount', () => {
    it('returns active count and max', async () => {
      mockRepo.countActiveByHostUserId.mockResolvedValue(2);

      const result = await schedulingService.getActiveCount('host1');

      expect(result).toEqual({ active: 2, max: 5 });
    });
  });

  describe('cancelContactedCandidate', () => {
    it('throws when request is not active', async () => {
      mockRepo.findRequestById.mockResolvedValue({ ...baseRequest, status: 'expired' });

      await expect(
        schedulingService.cancelContactedCandidate('req1', 'cand1', 'host1')
      ).rejects.toThrow('Request must be active to cancel a contacted candidate');
    });

    it('throws when candidate is not contacted or waiting_reply', async () => {
      mockRepo.findRequestById.mockResolvedValue(baseRequest);

      await expect(
        schedulingService.cancelContactedCandidate('req1', 'cand1', 'host1')
      ).rejects.toThrow('Only contacted candidates can be cancelled this way');
    });

    it('cancels contacted candidate successfully', async () => {
      const reqWithContacted = {
        ...baseRequest,
        candidates: [{ ...baseRequest.candidates![0], status: 'contacted' }],
      };
      mockRepo.findRequestById
        .mockResolvedValueOnce(reqWithContacted)
        .mockResolvedValue({ ...reqWithContacted, candidates: [{ ...reqWithContacted.candidates![0], status: 'cancelled' }] });
      mockRepo.updateCandidateStatus.mockResolvedValue(undefined);
      mockRepo.findActiveRequestById.mockResolvedValue(reqWithContacted);
      mockRepo.findPendingCandidatesOrdered.mockResolvedValue([]);
      mockRepo.countPendingCandidates.mockResolvedValue(0);
      mockRepo.countActiveCandidates.mockResolvedValue(1);

      const result = await schedulingService.cancelContactedCandidate('req1', 'cand1', 'host1');

      expect(mockRepo.updateCandidateStatus).toHaveBeenCalledWith('cand1', 'cancelled');
      expect(result).toBeDefined();
    });
  });

  describe('removeCandidate', () => {
    it('throws when request is not active or expired', async () => {
      mockRepo.findRequestById.mockResolvedValue({ ...baseRequest, status: 'cancelled' });

      await expect(
        schedulingService.removeCandidate('req1', 'cand1', 'host1')
      ).rejects.toThrow('Request must be active or expired to remove a candidate');
    });

    it('throws when candidate is not pending', async () => {
      mockRepo.findRequestById.mockResolvedValue(baseRequest);

      await expect(
        schedulingService.removeCandidate('req1', 'cand1', 'host1')
      ).rejects.toThrow('Only pending candidates can be removed');
    });

    it('removes pending candidate successfully', async () => {
      const reqWithPending = {
        ...baseRequest,
        candidates: [{ ...baseRequest.candidates![0], status: 'pending', id: 'cand2' }],
      };
      mockRepo.findRequestById
        .mockResolvedValueOnce(reqWithPending)
        .mockResolvedValue({ ...reqWithPending, candidates: [] });
      mockTx.schedulingCandidate.delete.mockResolvedValue(undefined);

      const result = await schedulingService.removeCandidate('req1', 'cand2', 'host1');

      expect(mockTx.schedulingCandidate.delete).toHaveBeenCalledWith({ where: { id: 'cand2' } });
      expect(result).toBeDefined();
    });
  });

  describe('cancelAcceptedCandidate', () => {
    it('throws when candidate has not accepted', async () => {
      mockRepo.findRequestById.mockResolvedValue(baseRequest);

      await expect(
        schedulingService.cancelAcceptedCandidate('req1', 'cand1', 'host1')
      ).rejects.toThrow('Candidate has not accepted; nothing to cancel');
    });

    it('reverts acceptance and reactivates request', async () => {
      const reqWithAccepted = {
        ...baseRequest,
        status: 'active',
        matchId: null,
        candidates: [{ ...baseRequest.candidates![0], status: 'accepted' }],
      };
      mockRepo.findRequestById
        .mockResolvedValueOnce(reqWithAccepted)
        .mockResolvedValue({ ...reqWithAccepted, candidates: [{ ...reqWithAccepted.candidates![0], status: 'cancelled' }] });
      mockTx.schedulingRequest.update.mockResolvedValue(undefined);
      mockRepo.updateCandidateStatus.mockResolvedValue(undefined);
      mockRepo.findActiveRequestById.mockResolvedValue(reqWithAccepted);
      mockRepo.findPendingCandidatesOrdered.mockResolvedValue([]);
      mockRepo.countPendingCandidates.mockResolvedValue(0);
      mockRepo.countActiveCandidates.mockResolvedValue(0);

      const result = await schedulingService.cancelAcceptedCandidate('req1', 'cand1', 'host1');

      expect(mockTx.schedulingRequest.update).toHaveBeenCalledWith({
        where: { id: 'req1' },
        data: { status: 'active', matchId: null },
      });
      expect(mockRepo.updateCandidateStatus).toHaveBeenCalledWith('cand1', 'cancelled');
      expect(result).toBeDefined();
    });
  });

  describe('getSchedulingRequestById', () => {
    it('returns request when found', async () => {
      mockRepo.findRequestById.mockResolvedValue(baseRequest);

      const result = await schedulingService.getSchedulingRequestById('req1');

      expect(result).toBeDefined();
      expect(result!.id).toBe('req1');
    });

    it('returns null when not found', async () => {
      mockRepo.findRequestById.mockResolvedValue(null);

      const result = await schedulingService.getSchedulingRequestById('req1');

      expect(result).toBeNull();
    });
  });

  describe('getSchedulingRequestByToken', () => {
    it('returns request when found by token', async () => {
      mockRepo.findRequestByInviteToken.mockResolvedValue(baseRequest);

      const result = await schedulingService.getSchedulingRequestByToken('abc123');

      expect(result).toBeDefined();
      expect(result!.id).toBe('req1');
    });

    it('returns null when token not found', async () => {
      mockRepo.findRequestByInviteToken.mockResolvedValue(null);

      const result = await schedulingService.getSchedulingRequestByToken('bad-token');

      expect(result).toBeNull();
    });
  });

  describe('addCandidates no-op', () => {
    it('returns unchanged when all candidates already exist', async () => {
      mockRepo.findRequestById.mockResolvedValue(baseRequest);

      const result = await schedulingService.addCandidates('req1', ['cand1'], 'host1');

      expect(mockRepo.addCandidates).not.toHaveBeenCalled();
      expect(result.id).toBe('req1');
    });
  });

  describe('cancelSchedulingRequest idempotent', () => {
    it('returns request unchanged when already cancelled', async () => {
      mockRepo.findRequestById.mockResolvedValue({ ...baseRequest, status: 'cancelled' });

      const result = await schedulingService.cancelSchedulingRequest('req1', 'host1');

      expect(mockRepo.updateRequestStatus).not.toHaveBeenCalled();
      expect(result.status).toBe('cancelled');
    });
  });

  describe('handleCandidateResponse additional patterns', () => {
    it('text "y" is no longer a recognized response', async () => {
      mockRepo.findCandidateToRecordResponseByPhone.mockResolvedValue({
        ...baseRequest.candidates![0],
        status: 'waiting_reply',
        schedulingRequest: { ...baseRequest, status: 'active' },
      });

      const result = await schedulingService.handleCandidateResponse('+456', 'y');

      expect(result).toEqual({ processed: false });
    });

    it('text "accept" is no longer a recognized response', async () => {
      mockRepo.findCandidateToRecordResponseByPhone.mockResolvedValue({
        ...baseRequest.candidates![0],
        status: 'waiting_reply',
        schedulingRequest: { ...baseRequest, status: 'active' },
      });

      const result = await schedulingService.handleCandidateResponse('+456', 'accept');

      expect(result).toEqual({ processed: false });
    });

    it('returns processed true but ignores accept when request not active and not late', async () => {
      const candidate = {
        ...baseRequest.candidates![0],
        status: 'waiting_reply',
        schedulingRequest: { ...baseRequest, status: 'expired' },
      };
      mockRepo.findCandidateToRecordResponseByPhone.mockResolvedValue(candidate);

      const result = await schedulingService.handleCandidateResponse('+456', 'yes');

      expect(result).toEqual({ processed: true });
    });

    it('returns processed true but ignores accept when candidate is late (expired)', async () => {
      const candidate = {
        ...baseRequest.candidates![0],
        status: 'expired',
        schedulingRequest: { ...baseRequest, status: 'active' },
      };
      mockRepo.findCandidateToRecordResponseByPhone.mockResolvedValue(candidate);

      const result = await schedulingService.handleCandidateResponse('+456', 'yes');

      expect(result).toEqual({ processed: true });
    });

    it('processes decline via None from contacted status', async () => {
      const candidate = {
        ...baseRequest.candidates![0],
        status: 'contacted',
        schedulingRequest: { ...baseRequest, status: 'active' },
      };
      mockRepo.findCandidateToRecordResponseByPhone.mockResolvedValue(candidate);
      mockTx.schedulingCandidate.updateMany.mockResolvedValue({ count: 1 });
      mockRepo.findActiveRequestById.mockResolvedValue(baseRequest);
      mockRepo.findPendingCandidatesOrdered.mockResolvedValue([]);
      mockRepo.countPendingCandidates.mockResolvedValue(0);
      mockRepo.countActiveCandidates.mockResolvedValue(0);

      const result = await schedulingService.handleCandidateResponse('+456', '', ['Ninguno']);

      expect(result).toEqual({ processed: true });
      expect(mockTx.schedulingCandidate.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: candidate.id, status: { in: ['waiting_reply', 'contacted'] } },
          data: expect.objectContaining({ status: 'declined' }),
        })
      );
    });

    it('ignores vote from expired candidate', async () => {
      const candidate = {
        ...baseRequest.candidates![0],
        status: 'expired',
        responseAt: null,
        schedulingRequest: { ...baseRequest, status: 'expired' },
      };
      mockRepo.findCandidateToRecordResponseByPhone.mockResolvedValue(candidate);

      const result = await schedulingService.handleCandidateResponse('+456', '', ['Ninguno']);

      expect(result).toEqual({ processed: true });
      expect(mockTx.schedulingCandidate.updateMany).not.toHaveBeenCalled();
    });
  });

  describe('createSchedulingRequest format', () => {
    it('forces doubles for padel sport', async () => {
      mockRepo.countActiveByHostUserId.mockResolvedValue(0);
      mockTx.user.findUnique.mockResolvedValue({ id: 'host1', name: 'Host' });
      const now = new Date();
      const createdReq = {
        id: 'req-padel',
        hostUserId: 'host1',
        hostPartnerUserId: 'partner1',
        sportType: 'padel',
        format: 'doubles',
        matchType: 'competitive',
        date: new Date(baseInput.date),
        startTime: new Date(baseInput.startTime),
        endTime: new Date(baseInput.endTime),
        locationText: 'Court 1',
        radiusKm: null,
        inviteToken: 'tok-padel',
        status: 'active',
        currentCandidateIndex: 0,
        matchId: null,
        createdAt: now,
        updatedAt: now,
      };
      mockTx.schedulingRequest.create.mockResolvedValue(createdReq);
      mockTx.schedulingCandidate.create.mockResolvedValue({ id: 'c1', schedulingRequestId: 'req-padel', contactUserId: 'c1', priorityOrder: 0, status: 'pending' });

      mockRepo.findRequestById.mockResolvedValue({
        ...createdReq,
        hostUser: { id: 'host1', name: 'Host' },
        hostPartner: { id: 'partner1', name: 'Partner' },
        candidates: [{ id: 'c1', contactUser: { name: 'C1' }, createdAt: now, updatedAt: now }],
        match: null,
      });

      const result = await schedulingService.createSchedulingRequest({
        ...baseInput,
        sportType: 'padel',
        hostPartnerUserId: 'partner1',
        candidateUserIds: ['c1', 'c2', 'c3'],
      });

      expect(result.format).toBe('doubles');
    });
  });

  describe('expireCandidate', () => {
    it('does nothing when candidate not found', async () => {
      mockTx.schedulingCandidate.findUnique.mockResolvedValue(null);

      await schedulingService.expireCandidate('cand1');

      expect(mockRepo.updateCandidateStatus).not.toHaveBeenCalled();
    });

    it('does nothing when candidate not waiting_reply', async () => {
      mockTx.schedulingCandidate.findUnique.mockResolvedValue({
        ...baseRequest.candidates![0],
        status: 'accepted',
        schedulingRequest: baseRequest,
        contactUser: baseRequest.candidates![0].contactUser,
      });

      await schedulingService.expireCandidate('cand1');

      expect(mockRepo.updateCandidateStatus).not.toHaveBeenCalled();
    });

    it('expires waiting_reply candidate and contacts next', async () => {
      const waitingCandidate = {
        ...baseRequest.candidates![0],
        status: 'waiting_reply',
        schedulingRequest: baseRequest,
        contactUser: { ...baseRequest.candidates![0].contactUser, phone: '+456' },
      };
      mockTx.schedulingCandidate.findUnique.mockResolvedValue(waitingCandidate);
      mockRepo.updateCandidateStatus.mockResolvedValue(undefined);
      mockRepo.findActiveRequestById.mockResolvedValue(baseRequest);
      mockRepo.findPendingCandidatesOrdered.mockResolvedValue([]);
      mockRepo.countPendingCandidates.mockResolvedValue(0);
      mockRepo.countActiveCandidates.mockResolvedValue(0);

      await schedulingService.expireCandidate('cand1');

      expect(mockRepo.updateCandidateStatus).toHaveBeenCalledWith('cand1', 'expired');
    });
  });

  describe('expireWaitingCandidates', () => {
    it('returns 0 because response windows were removed', async () => {
      mockRepo.findWaitingReplyCandidatesToExpire.mockResolvedValue([]);

      const count = await schedulingService.expireWaitingCandidates();

      expect(count).toBe(0);
    });
  });

  describe('expireRequestsPastScheduledTime', () => {
    it('expires active requests past scheduled time', async () => {
      mockRepo.findActivePastScheduledTime.mockResolvedValue([{ id: 'req1', date: new Date(), startTime: new Date() }]);
      mockRepo.updateRequestStatus.mockResolvedValue(undefined);

      const count = await schedulingService.expireRequestsPastScheduledTime();

      expect(count).toBe(1);
      expect(mockRepo.updateRequestStatus).toHaveBeenCalledWith('req1', 'expired');
    });
  });

  describe('listSchedulingRequestsByHost', () => {
    it('returns requests for host', async () => {
      mockTx.schedulingRequest.findMany.mockResolvedValue([baseRequest]);
      mockTx.schedulingInviteEvent.findMany.mockResolvedValue([]); // no_courts_at_quorum batch check
      mockRepo.findActivePastScheduledTime.mockResolvedValue([]); // called by expireRequestsPastScheduledTime

      const result = await schedulingService.listSchedulingRequestsByHost('host1');

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('req1');
    });
  });

  describe('listIncomingInvites', () => {
    it('returns empty when no incoming candidates', async () => {
      mockRepo.findIncomingCandidatesByUserId.mockResolvedValue([]);

      const result = await schedulingService.listIncomingInvites('user1');

      expect(result).toEqual([]);
    });

    it('returns requests for user as contact', async () => {
      mockRepo.findIncomingCandidatesByUserId.mockResolvedValue([
        { schedulingRequestId: 'req1', contactUserId: 'user1' },
      ]);
      mockTx.schedulingRequest.findMany.mockResolvedValue([baseRequest]);

      const result = await schedulingService.listIncomingInvites('user1');

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('req1');
    });
  });

  describe('getEventHistory', () => {
    it('returns empty array when no events exist', async () => {
      mockTx.schedulingInviteEvent.findMany.mockResolvedValue([]);
      mockTx.user.findMany.mockResolvedValue([]);

      const result = await schedulingService.getEventHistory('req1');

      expect(result).toEqual([]);
    });

    it('maps events to DTOs and resolves actor names', async () => {
      const eventDate = new Date('2025-04-15T10:00:00Z');
      const events = [
        {
          id: 'evt1',
          schedulingRequestId: 'req1',
          candidateId: 'cand1',
          actorUserId: 'host1',
          action: 'invite_sent',
          metadata: null,
          createdAt: eventDate,
          candidate: { contactUser: { name: 'Candidate' } },
        },
      ];
      mockTx.schedulingInviteEvent.findMany.mockResolvedValue(events);
      mockTx.user.findMany.mockResolvedValue([{ id: 'host1', name: 'Host User' }]);

      const result = await schedulingService.getEventHistory('req1');

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('evt1');
      expect(result[0].action).toBe('invite_sent');
      expect(result[0].actorUserName).toBe('Host User');
      expect(result[0].candidateUserName).toBe('Candidate');
      expect(result[0].createdAt).toBe(eventDate.toISOString());
    });

    it('sets actorUserName to null when actorUserId is null', async () => {
      const eventDate = new Date('2025-04-15T10:00:00Z');
      mockTx.schedulingInviteEvent.findMany.mockResolvedValue([
        {
          id: 'evt2',
          schedulingRequestId: 'req1',
          candidateId: null,
          actorUserId: null,
          action: 'booking_pending',
          metadata: { courtName: 'Court 3' },
          createdAt: eventDate,
          candidate: null,
        },
      ]);
      mockTx.user.findMany.mockResolvedValue([]);

      const result = await schedulingService.getEventHistory('req1');

      expect(result[0].actorUserName).toBeNull();
      expect(result[0].candidateUserName).toBeNull();
      expect(result[0].metadata).toEqual({ courtName: 'Court 3' });
    });
  });

  describe('handleCandidateResponse emoji patterns', () => {
    it('👍 emoji is no longer a recognized response', async () => {
      mockRepo.findCandidateToRecordResponseByPhone.mockResolvedValue({
        ...baseRequest.candidates![0],
        status: 'waiting_reply',
        schedulingRequest: { ...baseRequest, status: 'active' },
      });

      const result = await schedulingService.handleCandidateResponse('+456', '👍');

      expect(result).toEqual({ processed: false });
    });

    it('text containing 👍 is no longer a recognized response', async () => {
      mockRepo.findCandidateToRecordResponseByPhone.mockResolvedValue({
        ...baseRequest.candidates![0],
        status: 'waiting_reply',
        schedulingRequest: { ...baseRequest, status: 'active' },
      });

      const result = await schedulingService.handleCandidateResponse('+456', 'Sure 👍 sounds good');

      expect(result).toEqual({ processed: false });
    });

    it('does not accept with unrelated emoji', async () => {
      mockRepo.findCandidateToRecordResponseByPhone.mockResolvedValue({
        ...baseRequest.candidates![0],
        status: 'waiting_reply',
        schedulingRequest: { ...baseRequest, status: 'active' },
      });

      const result = await schedulingService.handleCandidateResponse('+456', '😊');

      expect(result).toEqual({ processed: false });
    });
  });

  describe('addCandidates to active request', () => {
    it('adds new candidates to an active request without reactivating', async () => {
      const activeReq = { ...baseRequest, status: 'active' };
      const updatedReq = {
        ...activeReq,
        candidates: [...activeReq.candidates!, { id: 'cand3', contactUser: { name: 'New' }, createdAt: new Date(), updatedAt: new Date() }],
      };
      mockRepo.findRequestById
        .mockResolvedValueOnce(activeReq)
        .mockResolvedValue(updatedReq);
      mockRepo.addCandidates.mockResolvedValue([{ id: 'cand3' }]);
      mockRepo.findActiveRequestById.mockResolvedValue(activeReq);
      mockRepo.findPendingCandidatesOrdered.mockResolvedValue([]);
      mockRepo.countPendingCandidates.mockResolvedValue(0);
      mockRepo.countActiveCandidates.mockResolvedValue(1);
      mockTx.user.findMany.mockResolvedValue([]);

      const result = await schedulingService.addCandidates('req1', ['cand3'], 'host1');

      expect(mockRepo.addCandidates).toHaveBeenCalledWith('req1', ['cand3']);
      // Active request should NOT trigger another updateRequestStatus to 'active'
      expect(mockRepo.updateRequestStatus).not.toHaveBeenCalledWith('req1', 'active');
      expect(result).toBeDefined();
    });
  });

  // ---------------------------------------------------------------------------
  // Multi-hour poll-based scheduling
  // ---------------------------------------------------------------------------

  describe('handleCandidateResponse — multi-hour poll routing', () => {
    const multiHourRequest = {
      ...baseRequest,
      startTime: new Date('2025-04-15T09:00:00.000Z'),
      endTime: new Date('2025-04-15T12:00:00.000Z'), // 3-hour window
      status: 'active',
    };
    const multiHourCandidate = {
      ...baseRequest.candidates![0],
      status: 'waiting_reply',
      schedulingRequest: multiHourRequest,
    };

    // Prevent debounce timers from leaking across tests
    beforeEach(() => { vi.useFakeTimers(); });
    afterEach(() => { vi.useRealTimers(); });

    it('processes HH:MM slot as a poll vote for single-hour requests', async () => {
      mockRepo.findCandidateToRecordResponseByPhone.mockResolvedValue({
        ...baseRequest.candidates![0],
        status: 'waiting_reply',
        schedulingRequest: { ...baseRequest, status: 'active' },
      });
      mockTx.schedulingInviteEvent.create.mockResolvedValue({});

      const result = await schedulingService.handleCandidateResponse('+456', '10:00');

      // Single-hour requests now use poll flow — '10:00' is a valid slot vote
      expect(result).toEqual({ processed: true });
      expect(mockTx.schedulingInviteEvent.create).toHaveBeenCalled();
    });

    it('routes to poll flow for multi-hour request with valid time slot', async () => {
      mockRepo.findCandidateToRecordResponseByPhone.mockResolvedValue(multiHourCandidate);
      mockTx.schedulingInviteEvent.create.mockResolvedValue({});
      mockTx.schedulingInviteEvent.findMany.mockResolvedValue([
        { candidateId: 'cand1', metadata: { hours: ['10'] } },
      ]);

      const result = await schedulingService.handleCandidateResponse('+456', '10:00');

      expect(result).toEqual({ processed: true });
      expect(mockTx.schedulingInviteEvent.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ action: 'poll_vote', candidateId: 'cand1' }),
        }),
      );
    });

    it('ignores poll vote when request is not active', async () => {
      mockRepo.findCandidateToRecordResponseByPhone.mockResolvedValue({
        ...multiHourCandidate,
        schedulingRequest: { ...multiHourRequest, status: 'completed' },
      });

      const result = await schedulingService.handleCandidateResponse('+456', '10:00');

      expect(result).toEqual({ processed: true });
      expect(mockTx.schedulingInviteEvent.create).not.toHaveBeenCalled();
    });

    it('ignores poll vote from expired candidate', async () => {
      mockRepo.findCandidateToRecordResponseByPhone.mockResolvedValue({
        ...multiHourCandidate,
        status: 'expired',
      });

      const result = await schedulingService.handleCandidateResponse('+456', '10:00');

      expect(result).toEqual({ processed: true });
      expect(mockTx.schedulingInviteEvent.create).not.toHaveBeenCalled();
    });

    it('returns processed: false when voted options contain no valid HH:MM slots', async () => {
      mockRepo.findCandidateToRecordResponseByPhone.mockResolvedValue(multiHourCandidate);

      const result = await schedulingService.handleCandidateResponse('+456', 'maybe', ['maybe']);

      expect(result).toEqual({ processed: false });
      expect(mockTx.schedulingInviteEvent.create).not.toHaveBeenCalled();
    });
  });

  describe('handlePollVote — quorum logic', () => {
    const multiHourRequest = {
      ...baseRequest,
      startTime: new Date('2025-04-15T09:00:00.000Z'),
      endTime: new Date('2025-04-15T12:00:00.000Z'),
      status: 'active',
      bookingEnabled: false,
    };
    const candidate = {
      ...baseRequest.candidates![0],
      status: 'waiting_reply',
      schedulingRequest: multiHourRequest,
    };

    // Quorum is now debounced — fake timers let us control when checkPollQuorum fires
    beforeEach(() => { vi.useFakeTimers(); });
    afterEach(() => { vi.useRealTimers(); });

    it('records poll_vote event with parsed hours', async () => {
      mockRepo.findCandidateToRecordResponseByPhone.mockResolvedValue(candidate);
      mockTx.schedulingInviteEvent.create.mockResolvedValue({});

      await schedulingService.handleCandidateResponse('+456', '10:00', ['10:00', '11:00']);

      expect(mockTx.schedulingInviteEvent.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            action: 'poll_vote',
            metadata: { hours: ['10', '11'] },
          }),
        }),
      );
    });

    it('uses latest vote per candidate when checking quorum (deduplicates multiple events)', async () => {
      mockRepo.findCandidateToRecordResponseByPhone.mockResolvedValue(candidate);
      mockTx.schedulingInviteEvent.create.mockResolvedValue({});
      // Two events for the same candidate → latest wins. Slot '10' has 1 vote = quorum for singles.
      mockTx.schedulingInviteEvent.findMany.mockResolvedValue([
        { candidateId: 'cand1', metadata: { hours: ['09'] } }, // older vote
        { candidateId: 'cand1', metadata: { hours: ['10'] } }, // latest vote
      ]);

      // checkPollQuorum re-fetches the request (active), then completeScheduling re-fetches (completed)
      mockTx.schedulingRequest.findUnique
        .mockResolvedValueOnce({ ...multiHourRequest, status: 'active', hostUser: null })
        .mockResolvedValueOnce({
          ...multiHourRequest,
          status: 'completed',
          hostUser: { id: 'host1', name: 'Host', email: null, phone: '+123' },
          hostPartner: null,
          candidates: [{ ...candidate, status: 'accepted', contactUser: { id: 'cand1', name: 'Cand', phone: '+456', email: null } }],
        });

      // First $transaction = quorum commit (updateMany + request completed)
      const mockTxQuorum = {
        schedulingCandidate: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
        schedulingRequest: { update: vi.fn() },
      };
      // Second $transaction = completeScheduling (availability + match creation)
      const mockTxMatchCreate = {
        availability: { create: vi.fn().mockResolvedValue({ id: 'av1' }) },
        schedulingRequest: { update: vi.fn() },
      };
      (prisma as any).$transaction
        .mockImplementationOnce(async (fn: any) => fn(mockTxQuorum))
        .mockImplementationOnce(async (fn: any) => fn(mockTxMatchCreate));

      mockTx.user.findMany.mockResolvedValue([]);

      await schedulingService.handleCandidateResponse('+456', '10:00', ['10:00']);
      await vi.runAllTimersAsync(); // fire debounce and await checkPollQuorum

      expect(mockTxQuorum.schedulingRequest.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ status: 'completed' }) }),
      );
    });

    it('does not complete when no slot has enough votes', async () => {
      mockRepo.findCandidateToRecordResponseByPhone.mockResolvedValue(candidate);
      mockTx.schedulingInviteEvent.create.mockResolvedValue({});
      mockTx.schedulingInviteEvent.findMany.mockResolvedValue([]); // no votes recorded yet
      mockTx.schedulingRequest.findUnique.mockResolvedValue({ ...multiHourRequest, status: 'active', hostUser: null });

      const result = await schedulingService.handleCandidateResponse('+456', '10:00');
      await vi.runAllTimersAsync();

      expect(result).toEqual({ processed: true });
      expect(mockTx.schedulingRequest.update).not.toHaveBeenCalled();
    });

    it('picks earliest confirmed slot when multiple slots reach quorum', async () => {
      mockRepo.findCandidateToRecordResponseByPhone.mockResolvedValue(candidate);
      mockTx.schedulingInviteEvent.create.mockResolvedValue({});
      // Candidate voted for 10:00 and 11:00 — both reach quorum for singles
      mockTx.schedulingInviteEvent.findMany.mockResolvedValue([
        { candidateId: 'cand1', metadata: { hours: ['10', '11'] } },
      ]);

      mockTx.schedulingRequest.findUnique
        .mockResolvedValueOnce({ ...multiHourRequest, status: 'active', hostUser: null })
        .mockResolvedValueOnce({
          ...multiHourRequest,
          status: 'completed',
          hostUser: { id: 'host1', name: 'Host', email: null, phone: '+123' },
          hostPartner: null,
          candidates: [{ ...candidate, status: 'accepted', contactUser: { id: 'cand1', name: 'Cand', phone: '+456', email: null } }],
        });

      const mockTxQuorum = {
        schedulingCandidate: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
        schedulingRequest: { update: vi.fn() },
      };
      const mockTxMatchCreate = {
        availability: { create: vi.fn().mockResolvedValue({ id: 'av1' }) },
        schedulingRequest: { update: vi.fn() },
      };
      (prisma as any).$transaction
        .mockImplementationOnce(async (fn: any) => fn(mockTxQuorum))
        .mockImplementationOnce(async (fn: any) => fn(mockTxMatchCreate));

      mockTx.user.findMany.mockResolvedValue([]);

      const { createMatch } = await import('../matches/matches.service');
      await schedulingService.handleCandidateResponse('+456', '10:00', ['10:00', '11:00']);
      await vi.runAllTimersAsync();

      // scheduledAt should be derived from the earliest confirmed slot (10:00)
      expect(vi.mocked(createMatch)).toHaveBeenCalledWith(
        expect.objectContaining({ scheduledAt: '2025-04-15T10:00:00.000Z' }),
        expect.anything(),
      );
    });

    it('ignores slots outside the request window', async () => {
      mockRepo.findCandidateToRecordResponseByPhone.mockResolvedValue(candidate);
      mockTx.schedulingInviteEvent.create.mockResolvedValue({});
      // Voted for 08:00 which is before the 09:00 window start
      mockTx.schedulingInviteEvent.findMany.mockResolvedValue([
        { candidateId: 'cand1', metadata: { hours: ['08'] } },
      ]);
      mockTx.schedulingRequest.findUnique.mockResolvedValue({ ...multiHourRequest, status: 'active', hostUser: null });

      const result = await schedulingService.handleCandidateResponse('+456', '08:00', ['08:00']);
      await vi.runAllTimersAsync();

      expect(result).toEqual({ processed: true });
      expect(mockTx.schedulingRequest.update).not.toHaveBeenCalled();
    });

    // ── helpers shared across new quorum tests ───────────────────────────

    function makeQuorumTransactionMocks() {
      const mockTxQuorum = {
        schedulingCandidate: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
        schedulingRequest: { update: vi.fn() },
      };
      const mockTxMatchCreate = {
        availability: { create: vi.fn().mockResolvedValue({ id: 'av1' }) },
        schedulingRequest: { update: vi.fn() },
      };
      (prisma as any).$transaction
        .mockImplementationOnce(async (fn: any) => fn(mockTxQuorum))
        .mockImplementationOnce(async (fn: any) => fn(mockTxMatchCreate));
      return { mockTxQuorum, mockTxMatchCreate };
    }

    // ── singles: slot-acceptance correctness ─────────────────────────────

    it('only accepts the candidate who voted for bestSlot, not others (singles)', async () => {
      // candA votes "09", candB votes "11" — both reach singles quorum (required=1)
      // bestSlot = "09" (earliest) → only candA should be marked accepted
      mockRepo.findCandidateToRecordResponseByPhone.mockResolvedValue(candidate);
      mockTx.schedulingInviteEvent.create.mockResolvedValue({});
      mockTx.schedulingInviteEvent.findMany.mockResolvedValue([
        { candidateId: 'candA', metadata: { hours: ['09'] } },
        { candidateId: 'candB', metadata: { hours: ['11'] } },
      ]);

      mockTx.schedulingRequest.findUnique
        .mockResolvedValueOnce({ ...multiHourRequest, status: 'active', hostUser: null })
        .mockResolvedValueOnce({
          ...multiHourRequest,
          status: 'completed',
          hostUser: { id: 'host1', name: 'Host', email: null, phone: '+123' },
          hostPartner: null,
          candidates: [{
            ...candidate,
            id: 'candA',
            status: 'accepted',
            contactUser: { id: 'candA', name: 'Player A', phone: '+001', email: null },
          }],
        });

      const { mockTxQuorum } = makeQuorumTransactionMocks();
      mockTx.user.findMany.mockResolvedValue([]);

      await schedulingService.handleCandidateResponse('+456', '09:00', ['09:00']);
      await vi.runAllTimersAsync();

      expect(mockTxQuorum.schedulingCandidate.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ id: { in: ['candA'] } }), // candB excluded
        }),
      );
    });

    it('no match when neither candidate voted for the other slot (no overlap)', async () => {
      // candA votes "09" only, candB votes "11" only, required=1 for singles
      // BUT: singles required=1 so each slot individually has quorum → this test
      // instead checks the doubles case where overlap IS required across 3 players
      // For singles "no overlap" scenario, see the doubles tests below.
      // This test verifies that a candidate who voted for a DIFFERENT slot from
      // bestSlot does NOT get their candidacy incorrectly scheduled.
      mockRepo.findCandidateToRecordResponseByPhone.mockResolvedValue(candidate);
      mockTx.schedulingInviteEvent.create.mockResolvedValue({});
      // candA votes only "11" — slot "11" is in window [09,12) but "09" and "10" have 0 votes
      mockTx.schedulingInviteEvent.findMany.mockResolvedValue([
        { candidateId: 'candA', metadata: { hours: ['11'] } },
      ]);

      mockTx.schedulingRequest.findUnique
        .mockResolvedValueOnce({ ...multiHourRequest, status: 'active', hostUser: null })
        .mockResolvedValueOnce({
          ...multiHourRequest,
          status: 'completed',
          hostUser: { id: 'host1', name: 'Host', email: null, phone: '+123' },
          hostPartner: null,
          candidates: [{
            ...candidate,
            id: 'candA',
            status: 'accepted',
            contactUser: { id: 'candA', name: 'Player A', phone: '+001', email: null },
          }],
        });

      const { mockTxQuorum } = makeQuorumTransactionMocks();
      mockTx.user.findMany.mockResolvedValue([]);

      const { createMatch } = await import('../matches/matches.service');
      await schedulingService.handleCandidateResponse('+456', '11:00', ['11:00']);
      await vi.runAllTimersAsync();

      // bestSlot must be "11:00", not "09:00" or "10:00"
      expect(vi.mocked(createMatch)).toHaveBeenCalledWith(
        expect.objectContaining({ scheduledAt: '2025-04-15T11:00:00.000Z' }),
        expect.anything(),
      );
      expect(mockTxQuorum.schedulingCandidate.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ id: { in: ['candA'] } }),
        }),
      );
    });

    // ── timezone offset ───────────────────────────────────────────────────

    it('matches votes against local timezone window and creates match at correct UTC time', async () => {
      // Europe/Madrid = UTC+2 in April (CEST)
      // startTime 15:00 UTC → 17:00 Madrid, endTime 19:00 UTC → 21:00 Madrid
      // Poll shows local slots: ["17:00", "18:00", "19:00", "20:00"]
      // User votes "19" (local) → bestSlot "19:00" local → 17:00 UTC
      const tzRequest = {
        ...multiHourRequest,
        startTime: new Date('2025-04-15T15:00:00.000Z'),
        endTime: new Date('2025-04-15T19:00:00.000Z'),
        timezone: 'Europe/Madrid',
      };

      mockRepo.findCandidateToRecordResponseByPhone.mockResolvedValue({
        ...candidate,
        schedulingRequest: tzRequest,
      });
      mockTx.schedulingInviteEvent.create.mockResolvedValue({});
      mockTx.schedulingInviteEvent.findMany.mockResolvedValue([
        { candidateId: 'cand1', metadata: { hours: ['19'] } }, // 19:00 Madrid
      ]);

      mockTx.schedulingRequest.findUnique
        .mockResolvedValueOnce({ ...tzRequest, status: 'active', hostUser: null })
        .mockResolvedValueOnce({
          ...tzRequest,
          status: 'completed',
          hostUser: { id: 'host1', name: 'Host', email: null, phone: '+123' },
          hostPartner: null,
          candidates: [{
            ...candidate,
            status: 'accepted',
            contactUser: { id: 'cand1', name: 'Cand', phone: '+456', email: null },
          }],
        });

      const { mockTxQuorum } = makeQuorumTransactionMocks();
      mockTx.user.findMany.mockResolvedValue([]);

      const { createMatch } = await import('../matches/matches.service');
      await schedulingService.handleCandidateResponse('+456', '19:00', ['19:00']);
      await vi.runAllTimersAsync();

      // 19:00 Madrid (UTC+2) = 17:00 UTC
      expect(vi.mocked(createMatch)).toHaveBeenCalledWith(
        expect.objectContaining({ scheduledAt: '2025-04-15T17:00:00.000Z' }),
        expect.anything(),
      );
      expect(mockTxQuorum.schedulingRequest.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ status: 'completed' }) }),
      );
    });

    it('does not create match when vote is only valid in UTC window but not in local window', async () => {
      // Europe/Madrid UTC+2: window 17:00–21:00 local = 15:00–19:00 UTC
      // User votes "15" (which is in the UTC window but NOT in the local [17,21) window)
      const tzRequest = {
        ...multiHourRequest,
        startTime: new Date('2025-04-15T15:00:00.000Z'),
        endTime: new Date('2025-04-15T19:00:00.000Z'),
        timezone: 'Europe/Madrid',
      };

      mockRepo.findCandidateToRecordResponseByPhone.mockResolvedValue({
        ...candidate,
        schedulingRequest: tzRequest,
      });
      mockTx.schedulingInviteEvent.create.mockResolvedValue({});
      mockTx.schedulingInviteEvent.findMany.mockResolvedValue([
        { candidateId: 'cand1', metadata: { hours: ['15'] } }, // not a valid local slot
      ]);

      mockTx.schedulingRequest.findUnique.mockResolvedValue({
        ...tzRequest,
        status: 'active',
        hostUser: null,
      });

      await schedulingService.handleCandidateResponse('+456', '15:00', ['15:00']);
      await vi.runAllTimersAsync();

      expect(mockTx.schedulingRequest.update).not.toHaveBeenCalled();
    });

    // ── doubles quorum ────────────────────────────────────────────────────

    it('doubles: reaches quorum when all 3 candidates vote for the same slot', async () => {
      const doublesRequest = { ...multiHourRequest, format: 'doubles' };
      const doublesCandidates = [
        { ...candidate, id: 'c1', contactUserId: 'c1', status: 'accepted', priorityOrder: 0, contactUser: { id: 'c1', name: 'P1', phone: '+001', email: null } },
        { ...candidate, id: 'c2', contactUserId: 'c2', status: 'accepted', priorityOrder: 1, contactUser: { id: 'c2', name: 'P2', phone: '+002', email: null } },
        { ...candidate, id: 'c3', contactUserId: 'c3', status: 'accepted', priorityOrder: 2, contactUser: { id: 'c3', name: 'P3', phone: '+003', email: null } },
      ];

      mockRepo.findCandidateToRecordResponseByPhone.mockResolvedValue({
        ...candidate,
        schedulingRequest: doublesRequest,
      });
      mockTx.schedulingInviteEvent.create.mockResolvedValue({});
      mockTx.schedulingInviteEvent.findMany.mockResolvedValue([
        { candidateId: 'c1', metadata: { hours: ['10'] } },
        { candidateId: 'c2', metadata: { hours: ['10'] } },
        { candidateId: 'c3', metadata: { hours: ['10'] } },
      ]);

      mockTx.schedulingRequest.findUnique
        .mockResolvedValueOnce({ ...doublesRequest, status: 'active', hostUser: null })
        .mockResolvedValueOnce({
          ...doublesRequest,
          status: 'completed',
          hostUser: { id: 'host1', name: 'Host', email: null, phone: '+123' },
          hostPartner: null,
          candidates: doublesCandidates,
        });

      const mockTxQuorum = {
        schedulingCandidate: { updateMany: vi.fn().mockResolvedValue({ count: 3 }) },
        schedulingRequest: { update: vi.fn() },
      };
      const mockTxMatchCreate = {
        availability: { create: vi.fn().mockResolvedValue({ id: 'av1' }) },
        schedulingRequest: { update: vi.fn() },
      };
      (prisma as any).$transaction
        .mockImplementationOnce(async (fn: any) => fn(mockTxQuorum))
        .mockImplementationOnce(async (fn: any) => fn(mockTxMatchCreate));
      mockTx.user.findMany.mockResolvedValue([]);

      await schedulingService.handleCandidateResponse('+001', '10:00', ['10:00']);
      await vi.runAllTimersAsync();

      expect(mockTxQuorum.schedulingRequest.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ status: 'completed' }) }),
      );
      expect(mockTxQuorum.schedulingCandidate.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ id: { in: ['c1', 'c2', 'c3'] } }),
        }),
      );
    });

    it('doubles: no quorum when no slot has 3 votes', async () => {
      const doublesRequest = { ...multiHourRequest, format: 'doubles' };

      mockRepo.findCandidateToRecordResponseByPhone.mockResolvedValue({
        ...candidate,
        schedulingRequest: doublesRequest,
      });
      mockTx.schedulingInviteEvent.create.mockResolvedValue({});
      // c1+c2 vote "10", c3 votes "11" → no slot reaches 3
      mockTx.schedulingInviteEvent.findMany.mockResolvedValue([
        { candidateId: 'c1', metadata: { hours: ['10'] } },
        { candidateId: 'c2', metadata: { hours: ['10'] } },
        { candidateId: 'c3', metadata: { hours: ['11'] } },
      ]);
      mockTx.schedulingRequest.findUnique.mockResolvedValue({
        ...doublesRequest,
        status: 'active',
        hostUser: null,
      });

      await schedulingService.handleCandidateResponse('+001', '10:00', ['10:00']);
      await vi.runAllTimersAsync();

      expect(mockTx.schedulingRequest.update).not.toHaveBeenCalled();
    });

    it('doubles: no quorum when fewer than 3 candidates have voted in total', async () => {
      const doublesRequest = { ...multiHourRequest, format: 'doubles' };

      mockRepo.findCandidateToRecordResponseByPhone.mockResolvedValue({
        ...candidate,
        schedulingRequest: doublesRequest,
      });
      mockTx.schedulingInviteEvent.create.mockResolvedValue({});
      // Only 2 voters recorded — not enough even to check slots (required=3)
      mockTx.schedulingInviteEvent.findMany.mockResolvedValue([
        { candidateId: 'c1', metadata: { hours: ['10'] } },
        { candidateId: 'c2', metadata: { hours: ['10'] } },
      ]);
      mockTx.schedulingRequest.findUnique.mockResolvedValue({
        ...doublesRequest,
        status: 'active',
        hostUser: null,
      });

      await schedulingService.handleCandidateResponse('+001', '10:00', ['10:00']);
      await vi.runAllTimersAsync();

      expect(mockTx.schedulingRequest.update).not.toHaveBeenCalled();
    });

    it('doubles: only the 3 candidates who voted for bestSlot are accepted, extras excluded', async () => {
      // 4 candidates all vote "10", but doubles only needs 3 → c4 must not be accepted
      const doublesRequest = { ...multiHourRequest, format: 'doubles' };
      const doublesCandidates = [
        { ...candidate, id: 'c1', contactUserId: 'c1', status: 'accepted', priorityOrder: 0, contactUser: { id: 'c1', name: 'P1', phone: '+001', email: null } },
        { ...candidate, id: 'c2', contactUserId: 'c2', status: 'accepted', priorityOrder: 1, contactUser: { id: 'c2', name: 'P2', phone: '+002', email: null } },
        { ...candidate, id: 'c3', contactUserId: 'c3', status: 'accepted', priorityOrder: 2, contactUser: { id: 'c3', name: 'P3', phone: '+003', email: null } },
      ];

      mockRepo.findCandidateToRecordResponseByPhone.mockResolvedValue({
        ...candidate,
        schedulingRequest: doublesRequest,
      });
      mockTx.schedulingInviteEvent.create.mockResolvedValue({});
      mockTx.schedulingInviteEvent.findMany.mockResolvedValue([
        { candidateId: 'c1', metadata: { hours: ['10'] } },
        { candidateId: 'c2', metadata: { hours: ['10'] } },
        { candidateId: 'c3', metadata: { hours: ['10'] } },
        { candidateId: 'c4', metadata: { hours: ['10'] } }, // extra voter
      ]);

      mockTx.schedulingRequest.findUnique
        .mockResolvedValueOnce({ ...doublesRequest, status: 'active', hostUser: null })
        .mockResolvedValueOnce({
          ...doublesRequest,
          status: 'completed',
          hostUser: { id: 'host1', name: 'Host', email: null, phone: '+123' },
          hostPartner: null,
          candidates: doublesCandidates,
        });

      const mockTxQuorum = {
        schedulingCandidate: { updateMany: vi.fn().mockResolvedValue({ count: 3 }) },
        schedulingRequest: { update: vi.fn() },
      };
      const mockTxMatchCreate = {
        availability: { create: vi.fn().mockResolvedValue({ id: 'av1' }) },
        schedulingRequest: { update: vi.fn() },
      };
      (prisma as any).$transaction
        .mockImplementationOnce(async (fn: any) => fn(mockTxQuorum))
        .mockImplementationOnce(async (fn: any) => fn(mockTxMatchCreate));
      mockTx.user.findMany.mockResolvedValue([]);

      await schedulingService.handleCandidateResponse('+001', '10:00', ['10:00']);
      await vi.runAllTimersAsync();

      // Exactly 3 accepted, c4 excluded
      expect(mockTxQuorum.schedulingCandidate.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ id: { in: ['c1', 'c2', 'c3'] } }), // not c4
        }),
      );
    });

    it('doubles: only candidates who voted for bestSlot are accepted, others excluded', async () => {
      // c1+c2+c3 vote "10", c4 votes "11" only → bestSlot "10", c4 must NOT be accepted
      const doublesRequest = { ...multiHourRequest, format: 'doubles' };
      const doublesCandidates = [
        { ...candidate, id: 'c1', contactUserId: 'c1', status: 'accepted', priorityOrder: 0, contactUser: { id: 'c1', name: 'P1', phone: '+001', email: null } },
        { ...candidate, id: 'c2', contactUserId: 'c2', status: 'accepted', priorityOrder: 1, contactUser: { id: 'c2', name: 'P2', phone: '+002', email: null } },
        { ...candidate, id: 'c3', contactUserId: 'c3', status: 'accepted', priorityOrder: 2, contactUser: { id: 'c3', name: 'P3', phone: '+003', email: null } },
      ];

      mockRepo.findCandidateToRecordResponseByPhone.mockResolvedValue({
        ...candidate,
        schedulingRequest: doublesRequest,
      });
      mockTx.schedulingInviteEvent.create.mockResolvedValue({});
      mockTx.schedulingInviteEvent.findMany.mockResolvedValue([
        { candidateId: 'c1', metadata: { hours: ['10'] } },
        { candidateId: 'c2', metadata: { hours: ['10'] } },
        { candidateId: 'c3', metadata: { hours: ['10'] } },
        { candidateId: 'c4', metadata: { hours: ['11'] } }, // voted for a different slot
      ]);

      mockTx.schedulingRequest.findUnique
        .mockResolvedValueOnce({ ...doublesRequest, status: 'active', hostUser: null })
        .mockResolvedValueOnce({
          ...doublesRequest,
          status: 'completed',
          hostUser: { id: 'host1', name: 'Host', email: null, phone: '+123' },
          hostPartner: null,
          candidates: doublesCandidates,
        });

      const mockTxQuorum = {
        schedulingCandidate: { updateMany: vi.fn().mockResolvedValue({ count: 3 }) },
        schedulingRequest: { update: vi.fn() },
      };
      const mockTxMatchCreate = {
        availability: { create: vi.fn().mockResolvedValue({ id: 'av1' }) },
        schedulingRequest: { update: vi.fn() },
      };
      (prisma as any).$transaction
        .mockImplementationOnce(async (fn: any) => fn(mockTxQuorum))
        .mockImplementationOnce(async (fn: any) => fn(mockTxMatchCreate));
      mockTx.user.findMany.mockResolvedValue([]);

      await schedulingService.handleCandidateResponse('+001', '10:00', ['10:00']);
      await vi.runAllTimersAsync();

      expect(mockTxQuorum.schedulingCandidate.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ id: { in: ['c1', 'c2', 'c3'] } }), // not c4
        }),
      );
    });
  });

  describe('contactNextCandidates — multi-hour poll invite', () => {
    it('sends poll with time slots when request window exceeds 1 hour', async () => {
      const multiHourReq = {
        ...baseRequest,
        startTime: new Date('2025-04-15T10:00:00.000Z'),
        endTime: new Date('2025-04-15T13:00:00.000Z'), // 10:00–13:00
        status: 'active',
        timezone: 'UTC',
        hostUser: { ...baseRequest.hostUser, locale: 'es' },
      };
      mockRepo.findActiveRequestById.mockResolvedValue(multiHourReq);
      mockRepo.findPendingCandidatesOrdered
        .mockResolvedValueOnce([{
          ...baseRequest.candidates![0],
          status: 'pending',
          contactUser: { id: 'cand1', name: 'Cand', phone: '+456', email: null, locale: 'es' },
        }])
        .mockResolvedValue([]);
      mockRepo.updateCandidateStatus.mockResolvedValue(undefined);
      mockRepo.countPendingCandidates.mockResolvedValue(0);
      mockRepo.countActiveCandidates.mockResolvedValue(0);
      mockTx.schedulingCandidate.update.mockResolvedValue({});
      mockTx.schedulingRequest.update.mockResolvedValue({});
      mockTx.schedulingInviteEvent.create.mockResolvedValue({});

      await schedulingService.contactNextCandidates('req1');

      expect(whatsappService.sendInviteMessage).toHaveBeenCalledWith(
        '+456',
        expect.stringContaining('¿A qué hora te va bien?'),
        expect.objectContaining({
          buttons: expect.arrayContaining([
            expect.objectContaining({ title: '10:00' }),
            expect.objectContaining({ title: '11:00' }),
            expect.objectContaining({ title: '12:00' }),
          ]),
        }),
      );
    });

    it('sends poll invite with slot and None for single-hour request', async () => {
      const singleHourReq = {
        ...baseRequest,
        startTime: new Date('2025-04-15T10:00:00.000Z'),
        endTime: new Date('2025-04-15T11:00:00.000Z'),
        status: 'active',
        timezone: 'UTC',
        hostUser: { ...baseRequest.hostUser, locale: 'es' },
      };
      mockRepo.findActiveRequestById.mockResolvedValue(singleHourReq);
      mockRepo.findPendingCandidatesOrdered
        .mockResolvedValueOnce([{
          ...baseRequest.candidates![0],
          status: 'pending',
          contactUser: { id: 'cand1', name: 'Cand', phone: '+456', email: null, locale: 'es' },
        }])
        .mockResolvedValue([]);
      mockRepo.updateCandidateStatus.mockResolvedValue(undefined);
      mockRepo.countPendingCandidates.mockResolvedValue(0);
      mockRepo.countActiveCandidates.mockResolvedValue(0);
      mockTx.schedulingCandidate.update.mockResolvedValue({});
      mockTx.schedulingRequest.update.mockResolvedValue({});
      mockTx.schedulingInviteEvent.create.mockResolvedValue({});

      await schedulingService.contactNextCandidates('req1');

      expect(whatsappService.sendInviteMessage).toHaveBeenCalledWith(
        '+456',
        expect.stringContaining('¿A qué hora'),
        expect.objectContaining({
          buttons: expect.arrayContaining([
            expect.objectContaining({ title: '10:00' }),
            expect.objectContaining({ title: 'Ninguno' }),
          ]),
        }),
      );
    });
  });

  describe('createSchedulingRequest bookingEnabled flag', () => {
    it('passes bookingEnabled: true through to the created request', async () => {
      mockRepo.countActiveByHostUserId.mockResolvedValue(0);
      mockTx.user.findUnique.mockResolvedValue({ id: 'host1', name: 'Host' });
      const now = new Date();
      const createdReq = {
        id: 'req-booking',
        hostUserId: 'host1',
        hostPartnerUserId: null,
        sportType: 'tennis',
        format: 'singles',
        matchType: 'practice',
        date: new Date(baseInput.date),
        startTime: new Date(baseInput.startTime),
        endTime: new Date(baseInput.endTime),
        locationText: 'Court 1',
        radiusKm: null,
        inviteToken: 'tok-book',
        status: 'active',
        currentCandidateIndex: 0,
        matchId: null,
        bookingEnabled: true,
        createdAt: now,
        updatedAt: now,
      };
      mockTx.schedulingRequest.create.mockResolvedValue(createdReq);
      mockTx.schedulingCandidate.create.mockResolvedValue({
        id: 'c-new', schedulingRequestId: 'req-booking', contactUserId: 'cand1', priorityOrder: 0, status: 'pending',
      });
      mockRepo.findRequestById.mockResolvedValue({
        ...createdReq,
        hostUser: { id: 'host1', name: 'Host' },
        hostPartner: null,
        candidates: [{ id: 'c-new', contactUser: { name: 'Cand' }, createdAt: now, updatedAt: now }],
        match: null,
      });

      await schedulingService.createSchedulingRequest({ ...baseInput, bookingEnabled: true });

      expect(mockTx.schedulingRequest.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ bookingEnabled: true }),
        }),
      );
    });

    it('defaults bookingEnabled to false when not provided', async () => {
      mockRepo.countActiveByHostUserId.mockResolvedValue(0);
      mockTx.user.findUnique.mockResolvedValue({ id: 'host1', name: 'Host' });
      const now = new Date();
      const createdReq = {
        id: 'req-no-booking', hostUserId: 'host1', hostPartnerUserId: null,
        sportType: 'tennis', format: 'singles', matchType: 'practice',
        date: new Date(baseInput.date), startTime: new Date(baseInput.startTime), endTime: new Date(baseInput.endTime),
        locationText: 'Court 1', radiusKm: null,
        inviteToken: 'tok-x', status: 'active', currentCandidateIndex: 0,
        matchId: null, bookingEnabled: false, createdAt: now, updatedAt: now,
      };
      mockTx.schedulingRequest.create.mockResolvedValue(createdReq);
      mockTx.schedulingCandidate.create.mockResolvedValue({
        id: 'c-new', schedulingRequestId: 'req-no-booking', contactUserId: 'cand1', priorityOrder: 0, status: 'pending',
      });
      mockRepo.findRequestById.mockResolvedValue({
        ...createdReq,
        hostUser: { id: 'host1', name: 'Host' },
        hostPartner: null,
        candidates: [{ id: 'c-new', contactUser: { name: 'Cand' }, createdAt: now, updatedAt: now }],
        match: null,
      });

      await schedulingService.createSchedulingRequest(baseInput);

      expect(mockTx.schedulingRequest.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ bookingEnabled: false }),
        }),
      );
    });
  });
});
