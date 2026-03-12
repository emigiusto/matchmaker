import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AppError } from '../../shared/errors/AppError';

// ------------------------------------------------------
// Hoisted mocks (must be available when vi.mock factories run)
// ------------------------------------------------------

const { mockTx, mockRepo } = vi.hoisted(() => {
  const mockTx = {
    user: { findUnique: vi.fn() },
    schedulingRequest: { create: vi.fn(), update: vi.fn(), findUnique: vi.fn(), findMany: vi.fn() },
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
    availability: mockTx.availability,
    match: mockTx.match,
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
  responseWindowMinutes: 240,
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
  responseWindowMinutes: 240,
  maxParallelCandidates: 1,
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

    it('throws when responseWindowMinutes is invalid', async () => {
      mockRepo.countActiveByHostUserId.mockResolvedValue(0);
      mockTx.user.findUnique.mockResolvedValue({ id: 'host1', name: 'Host' });

      await expect(
        schedulingService.createSchedulingRequest({
          ...baseInput,
          responseWindowMinutes: 2000,
        })
      ).rejects.toThrow(/Invalid responseWindowMinutes/);
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
        responseWindowMinutes: baseInput.responseWindowMinutes,
        inviteToken: 'tok-xyz',
        status: 'active',
        currentCandidateIndex: 0,
        matchId: null,
        maxParallelCandidates: 1,
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
      ).rejects.toThrow('Only expired or cancelled candidates can be retried');
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
      mockRepo.countWaitingReplyCandidates
        .mockResolvedValueOnce(0)
        .mockResolvedValue(1);
      mockRepo.countPendingCandidates.mockResolvedValue(0);

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
      mockRepo.countWaitingReplyCandidates.mockResolvedValue(1);

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

      const mockTxForUpdate = {
        schedulingCandidate: {
          updateMany: vi.fn().mockResolvedValue({ count: 1 }),
          findMany: vi.fn().mockResolvedValue([{ status: 'pending' }]), // not enough accepted yet
        },
        schedulingRequest: { update: vi.fn() },
      };
      const prismaMock = prisma as any;
      prismaMock.$transaction.mockImplementation(async (fn: any) => fn(mockTxForUpdate));

      mockRepo.findActiveRequestById.mockResolvedValue(baseRequest);
      mockRepo.findPendingCandidatesOrdered.mockResolvedValue([]);
      mockRepo.countWaitingReplyCandidates.mockResolvedValue(0);
      mockRepo.countPendingCandidates.mockResolvedValue(0);

      const result = await schedulingService.handleCandidateResponse('+456', 'yes');

      expect(result).toEqual({ processed: true });
      expect(mockTxForUpdate.schedulingCandidate.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: candidate.id, status: { in: ['waiting_reply', 'contacted'] } },
          data: expect.objectContaining({ status: 'accepted' }),
        })
      );
    });

    it('processes decline', async () => {
      const candidate = {
        ...baseRequest.candidates![0],
        status: 'waiting_reply',
        schedulingRequest: { ...baseRequest, status: 'active' },
      };
      mockRepo.findCandidateToRecordResponseByPhone.mockResolvedValue(candidate);
      mockRepo.updateCandidateFromWaitingReply.mockResolvedValue(true);
      mockRepo.findActiveRequestById.mockResolvedValue(baseRequest);
      mockRepo.findPendingCandidatesOrdered.mockResolvedValue([]);
      mockRepo.countWaitingReplyCandidates.mockResolvedValue(0);
      mockRepo.countPendingCandidates.mockResolvedValue(0);

      const result = await schedulingService.handleCandidateResponse('+456', 'no');

      expect(result).toEqual({ processed: true });
      expect(mockRepo.updateCandidateFromWaitingReply).toHaveBeenCalledWith(candidate.id, 'declined', expect.any(Date));
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

      expect(link).toBe('https://app.example.com/play?invite=abc123');
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

  describe('manualAcceptCandidate', () => {
    it('throws when user is not the host', async () => {
      mockRepo.findRequestById.mockResolvedValue(baseRequest);

      await expect(
        schedulingService.manualAcceptCandidate('req1', 'cand1', 'other-user')
      ).rejects.toThrow('Only the host can accept candidates');
    });

    it('throws when request is completed', async () => {
      mockRepo.findRequestById.mockResolvedValue({ ...baseRequest, status: 'completed' });

      await expect(
        schedulingService.manualAcceptCandidate('req1', 'cand1', 'host1')
      ).rejects.toThrow('Match already completed');
    });

    it('throws when candidate already accepted', async () => {
      mockRepo.findRequestById.mockResolvedValue({
        ...baseRequest,
        candidates: [{ ...baseRequest.candidates![0], status: 'accepted' }],
      });

      await expect(
        schedulingService.manualAcceptCandidate('req1', 'cand1', 'host1')
      ).rejects.toThrow('Candidate already accepted');
    });

    it('accepts candidate and calls contactNextCandidates when singles not complete', async () => {
      const reqWithWaiting = {
        ...baseRequest,
        candidates: [{ ...baseRequest.candidates![0], status: 'waiting_reply' }],
      };
      mockRepo.findRequestById
        .mockResolvedValueOnce(reqWithWaiting)
        .mockResolvedValue({ ...reqWithWaiting, candidates: [{ ...reqWithWaiting.candidates![0], status: 'accepted' }] });
      mockRepo.updateCandidateStatus.mockResolvedValue(undefined);
      mockRepo.updateRequestStatus.mockResolvedValue(undefined);
      mockRepo.findActiveRequestById.mockResolvedValue(reqWithWaiting);
      mockRepo.findPendingCandidatesOrdered.mockResolvedValue([]);
      mockRepo.countWaitingReplyCandidates.mockResolvedValue(0);
      mockRepo.countPendingCandidates.mockResolvedValue(0);

      const result = await schedulingService.manualAcceptCandidate('req1', 'cand1', 'host1');

      expect(mockRepo.updateCandidateStatus).toHaveBeenCalledWith('cand1', 'accepted', expect.any(Date));
      expect(result).toBeDefined();
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
      mockRepo.countWaitingReplyCandidates.mockResolvedValue(1);

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
      mockRepo.countWaitingReplyCandidates.mockResolvedValue(0);
      mockRepo.countPendingCandidates.mockResolvedValue(0);

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
    it('accepts with "y"', async () => {
      const candidate = {
        ...baseRequest.candidates![0],
        status: 'waiting_reply',
        schedulingRequest: { ...baseRequest, status: 'active' },
      };
      mockRepo.findCandidateToRecordResponseByPhone.mockResolvedValue(candidate);
      const mockTxForUpdate = {
        schedulingCandidate: {
          updateMany: vi.fn().mockResolvedValue({ count: 1 }),
          findMany: vi.fn().mockResolvedValue([{ status: 'pending' }]),
        },
        schedulingRequest: { update: vi.fn() },
      };
      (prisma as any).$transaction.mockImplementation(async (fn: any) => fn(mockTxForUpdate));
      mockRepo.findActiveRequestById.mockResolvedValue(baseRequest);
      mockRepo.findPendingCandidatesOrdered.mockResolvedValue([]);
      mockRepo.countWaitingReplyCandidates.mockResolvedValue(0);
      mockRepo.countPendingCandidates.mockResolvedValue(0);

      const result = await schedulingService.handleCandidateResponse('+456', 'y');

      expect(result).toEqual({ processed: true });
    });

    it('accepts with "accept"', async () => {
      const candidate = {
        ...baseRequest.candidates![0],
        status: 'waiting_reply',
        schedulingRequest: { ...baseRequest, status: 'active' },
      };
      mockRepo.findCandidateToRecordResponseByPhone.mockResolvedValue(candidate);
      const mockTxForUpdate = {
        schedulingCandidate: {
          updateMany: vi.fn().mockResolvedValue({ count: 1 }),
          findMany: vi.fn().mockResolvedValue([{ status: 'pending' }]),
        },
        schedulingRequest: { update: vi.fn() },
      };
      (prisma as any).$transaction.mockImplementation(async (fn: any) => fn(mockTxForUpdate));
      mockRepo.findActiveRequestById.mockResolvedValue(baseRequest);
      mockRepo.findPendingCandidatesOrdered.mockResolvedValue([]);
      mockRepo.countWaitingReplyCandidates.mockResolvedValue(0);
      mockRepo.countPendingCandidates.mockResolvedValue(0);

      const result = await schedulingService.handleCandidateResponse('+456', 'accept');

      expect(result).toEqual({ processed: true });
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

    it('processes decline from contacted status', async () => {
      const candidate = {
        ...baseRequest.candidates![0],
        status: 'contacted',
        schedulingRequest: { ...baseRequest, status: 'active' },
      };
      mockRepo.findCandidateToRecordResponseByPhone.mockResolvedValue(candidate);
      mockTx.schedulingCandidate.updateMany.mockResolvedValue({ count: 1 });
      mockRepo.findActiveRequestById.mockResolvedValue(baseRequest);
      mockRepo.findPendingCandidatesOrdered.mockResolvedValue([]);
      mockRepo.countWaitingReplyCandidates.mockResolvedValue(0);
      mockRepo.countPendingCandidates.mockResolvedValue(0);

      const result = await schedulingService.handleCandidateResponse('+456', 'no');

      expect(result).toEqual({ processed: true });
      expect(mockTx.schedulingCandidate.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: candidate.id, status: 'contacted' },
          data: expect.objectContaining({ status: 'declined' }),
        })
      );
    });

    it('processes decline from expired status (late response)', async () => {
      const candidate = {
        ...baseRequest.candidates![0],
        status: 'expired',
        responseAt: null,
        schedulingRequest: { ...baseRequest, status: 'expired' },
      };
      mockRepo.findCandidateToRecordResponseByPhone.mockResolvedValue(candidate);
      mockTx.schedulingCandidate.updateMany.mockResolvedValue({ count: 1 });
      mockRepo.findActiveRequestById.mockResolvedValue(null);

      const result = await schedulingService.handleCandidateResponse('+456', 'n');

      expect(result).toEqual({ processed: true });
      expect(mockTx.schedulingCandidate.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: candidate.id, status: 'expired', responseAt: null },
          data: expect.objectContaining({ status: 'declined' }),
        })
      );
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
        responseWindowMinutes: 240,
        inviteToken: 'tok-padel',
        status: 'active',
        currentCandidateIndex: 0,
        matchId: null,
        maxParallelCandidates: 1,
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
      mockRepo.countWaitingReplyCandidates.mockResolvedValue(0);
      mockRepo.countPendingCandidates.mockResolvedValue(0);

      await schedulingService.expireCandidate('cand1');

      expect(mockRepo.updateCandidateStatus).toHaveBeenCalledWith('cand1', 'expired');
    });
  });

  describe('expireWaitingCandidates', () => {
    it('expires candidates past response window', async () => {
      const oldCandidate = {
        id: 'cand1',
        contactedAt: new Date(Date.now() - 5 * 60 * 60 * 1000),
        schedulingRequest: { responseWindowMinutes: 240 },
      };
      mockRepo.findWaitingReplyCandidatesToExpire.mockResolvedValue([oldCandidate]);
      mockTx.schedulingCandidate.findUnique.mockResolvedValue({
        ...baseRequest.candidates![0],
        status: 'waiting_reply',
        contactUser: { phone: '+456' },
        schedulingRequest: baseRequest,
      });
      mockRepo.updateCandidateStatus.mockResolvedValue(undefined);
      mockRepo.findActiveRequestById.mockResolvedValue(baseRequest);
      mockRepo.findPendingCandidatesOrdered.mockResolvedValue([]);
      mockRepo.countWaitingReplyCandidates.mockResolvedValue(0);
      mockRepo.countPendingCandidates.mockResolvedValue(0);

      const count = await schedulingService.expireWaitingCandidates();

      expect(count).toBe(1);
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
});
