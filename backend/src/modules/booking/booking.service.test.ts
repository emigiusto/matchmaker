import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AppError } from '../../shared/errors/AppError';

// ─── Hoisted mocks ────────────────────────────────────────────────

const mockPrisma = vi.hoisted(() => ({
  clubMembership: {
    upsert: vi.fn(),
    findUnique: vi.fn(),
    findFirst: vi.fn(),
    findMany: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
  bookingAttempt: {
    findUnique: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    deleteMany: vi.fn(),
  },
  match: {
    findUnique: vi.fn(),
  },
  schedulingRequest: {
    findUnique: vi.fn(),
  },
  schedulingInviteEvent: {
    create: vi.fn(),
  },
}));

const mockAdapter = vi.hoisted(() => ({
  testConnection: vi.fn(),
  checkAvailability: vi.fn(),
  book: vi.fn(),
  cancel: vi.fn(),
}));

vi.mock('../../prisma', () => ({ prisma: mockPrisma }));
vi.mock('./adapters/adapter.registry', () => ({
  getAdapter: vi.fn(() => mockAdapter),
}));
vi.mock('../../shared/utils/crypto.utils', () => ({
  encrypt: vi.fn((v: string) => `enc:${v}`),
  decrypt: vi.fn((v: string) => v.replace('enc:', '')),
}));
vi.mock('../../config/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock('../whatsapp/whatsapp.service', () => ({
  whatsappService: { sendGroupMessage: vi.fn().mockResolvedValue(undefined) },
}));

// Import AFTER mocks
import {
  upsertClubMembership,
  getClubMembership,
  listClubMemberships,
  deleteClubMembership,
  testClubConnection,
  triggerBookingForMatch,
  retryBookingForMatch,
  cancelBookingForMatch,
  getBookingAttemptByMatch,
} from './booking.service';

// ─── Fixtures ─────────────────────────────────────────────────────

const now = new Date('2026-03-15T10:00:00Z');

const baseMembership = {
  id: 'mem1',
  userId: 'user1',
  clubSlug: 'laieta',
  adapterType: 'miclubonline',
  socioNumber: '12345',
  encryptedPassword: 'enc:secret',
  status: 'active',
  lastVerifiedAt: null,
  createdAt: now,
  updatedAt: now,
};

const baseAttempt = {
  id: 'attempt1',
  matchId: 'match1',
  clubMembershipId: 'mem1',
  status: 'success',
  externalBookingId: 'laieta::2026-03-15::10',
  courtName: 'Court 1',
  errorMessage: null,
  attemptedAt: now,
  completedAt: now,
};

const baseMatch = {
  id: 'match1',
  whatsappGroupId: null,
  availability: { userId: 'user1', date: now, startTime: now },
  participants: [
    { userId: 'user1', user: { id: 'user1', name: 'Host', phone: '+34600000001' } },
    { userId: 'user2', user: { id: 'user2', name: 'Guest', phone: '+34600000002' } },
  ],
};

beforeEach(() => {
  vi.clearAllMocks();
});

// ─── upsertClubMembership ─────────────────────────────────────────

describe('upsertClubMembership', () => {
  it('creates membership with encrypted password', async () => {
    mockPrisma.clubMembership.upsert.mockResolvedValue(baseMembership);

    const result = await upsertClubMembership({
      userId: 'user1',
      clubSlug: 'laieta',
      adapterType: 'miclubonline',
      socioNumber: '12345',
      password: 'secret',
    });

    expect(mockPrisma.clubMembership.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ encryptedPassword: 'enc:secret', status: 'unverified' }),
        update: expect.objectContaining({ encryptedPassword: 'enc:secret', status: 'unverified' }),
      }),
    );
    expect(result.id).toBe('mem1');
    expect(result.hasPassword).toBe(true);
    expect(result.socioNumber).toBe('12345');
  });

  it('creates membership without password (encryptedPassword null)', async () => {
    const membershipNoPass = { ...baseMembership, encryptedPassword: null };
    mockPrisma.clubMembership.upsert.mockResolvedValue(membershipNoPass);

    const result = await upsertClubMembership({
      userId: 'user1',
      clubSlug: 'laieta',
      adapterType: 'miclubonline',
      socioNumber: '12345',
    });

    expect(mockPrisma.clubMembership.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ encryptedPassword: null }),
      }),
    );
    expect(result.hasPassword).toBe(false);
  });

  it('resets status to unverified and clears lastVerifiedAt on update', async () => {
    mockPrisma.clubMembership.upsert.mockResolvedValue(baseMembership);

    await upsertClubMembership({
      userId: 'user1',
      clubSlug: 'laieta',
      adapterType: 'miclubonline',
      socioNumber: '99999',
    });

    expect(mockPrisma.clubMembership.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({ status: 'unverified', lastVerifiedAt: null }),
      }),
    );
  });
});

// ─── getClubMembership ────────────────────────────────────────────

describe('getClubMembership', () => {
  it('returns DTO when found', async () => {
    mockPrisma.clubMembership.findUnique.mockResolvedValue(baseMembership);

    const result = await getClubMembership('user1', 'laieta');

    expect(result).not.toBeNull();
    expect(result!.clubSlug).toBe('laieta');
    expect(result!.status).toBe('active');
  });

  it('returns null when not found', async () => {
    mockPrisma.clubMembership.findUnique.mockResolvedValue(null);

    const result = await getClubMembership('user1', 'laieta');

    expect(result).toBeNull();
  });
});

// ─── listClubMemberships ──────────────────────────────────────────

describe('listClubMemberships', () => {
  it('returns mapped DTOs for all memberships', async () => {
    mockPrisma.clubMembership.findMany.mockResolvedValue([baseMembership]);

    const result = await listClubMemberships('user1');

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('mem1');
    expect(result[0].hasPassword).toBe(true);
  });

  it('returns empty array when user has no memberships', async () => {
    mockPrisma.clubMembership.findMany.mockResolvedValue([]);

    const result = await listClubMemberships('user1');

    expect(result).toEqual([]);
  });
});

// ─── deleteClubMembership ─────────────────────────────────────────

describe('deleteClubMembership', () => {
  it('is a no-op when membership does not exist', async () => {
    mockPrisma.clubMembership.findUnique.mockResolvedValue(null);

    await deleteClubMembership('user1', 'laieta');

    expect(mockPrisma.bookingAttempt.deleteMany).not.toHaveBeenCalled();
    expect(mockPrisma.clubMembership.delete).not.toHaveBeenCalled();
  });

  it('deletes referencing booking attempts before deleting membership', async () => {
    mockPrisma.clubMembership.findUnique.mockResolvedValue(baseMembership);
    mockPrisma.bookingAttempt.deleteMany.mockResolvedValue({ count: 2 });
    mockPrisma.clubMembership.delete.mockResolvedValue(undefined);

    await deleteClubMembership('user1', 'laieta');

    expect(mockPrisma.bookingAttempt.deleteMany).toHaveBeenCalledWith({
      where: { clubMembershipId: 'mem1' },
    });
    expect(mockPrisma.clubMembership.delete).toHaveBeenCalledWith({
      where: { id: 'mem1' },
    });
    // Attempts deleted BEFORE membership
    const deleteManyCalls = mockPrisma.bookingAttempt.deleteMany.mock.invocationCallOrder[0];
    const deleteCalls = mockPrisma.clubMembership.delete.mock.invocationCallOrder[0];
    expect(deleteManyCalls).toBeLessThan(deleteCalls);
  });

  it('deletes membership even when there are no referencing attempts', async () => {
    mockPrisma.clubMembership.findUnique.mockResolvedValue(baseMembership);
    mockPrisma.bookingAttempt.deleteMany.mockResolvedValue({ count: 0 });
    mockPrisma.clubMembership.delete.mockResolvedValue(undefined);

    await deleteClubMembership('user1', 'laieta');

    expect(mockPrisma.clubMembership.delete).toHaveBeenCalledOnce();
  });
});

// ─── testClubConnection ───────────────────────────────────────────

describe('testClubConnection', () => {
  it('throws 404 when membership not found', async () => {
    mockPrisma.clubMembership.findUnique.mockResolvedValue(null);

    await expect(testClubConnection('user1', 'laieta')).rejects.toThrow(AppError);
    await expect(testClubConnection('user1', 'laieta')).rejects.toThrow('Club membership not found');
  });

  it('throws 400 when no password stored', async () => {
    mockPrisma.clubMembership.findUnique.mockResolvedValue({
      ...baseMembership,
      encryptedPassword: null,
    });

    await expect(testClubConnection('user1', 'laieta')).rejects.toThrow('No password stored');
  });

  it('updates status to active and returns true when adapter succeeds', async () => {
    mockPrisma.clubMembership.findUnique.mockResolvedValue(baseMembership);
    mockAdapter.testConnection.mockResolvedValue(true);
    mockPrisma.clubMembership.update.mockResolvedValue({ ...baseMembership, status: 'active' });

    const result = await testClubConnection('user1', 'laieta');

    expect(result).toBe(true);
    expect(mockPrisma.clubMembership.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'active', lastVerifiedAt: expect.any(Date) }),
      }),
    );
  });

  it('updates status to invalid_credentials and returns false when adapter fails', async () => {
    mockPrisma.clubMembership.findUnique.mockResolvedValue(baseMembership);
    mockAdapter.testConnection.mockResolvedValue(false);
    mockPrisma.clubMembership.update.mockResolvedValue({
      ...baseMembership,
      status: 'invalid_credentials',
    });

    const result = await testClubConnection('user1', 'laieta');

    expect(result).toBe(false);
    expect(mockPrisma.clubMembership.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'invalid_credentials' }),
      }),
    );
  });

  it('decrypts the password before passing to adapter', async () => {
    mockPrisma.clubMembership.findUnique.mockResolvedValue({
      ...baseMembership,
      encryptedPassword: 'enc:mypassword',
    });
    mockAdapter.testConnection.mockResolvedValue(true);
    mockPrisma.clubMembership.update.mockResolvedValue(baseMembership);

    await testClubConnection('user1', 'laieta');

    expect(mockAdapter.testConnection).toHaveBeenCalledWith(
      expect.objectContaining({ password: 'mypassword' }),
    );
  });
});

// ─── triggerBookingForMatch ───────────────────────────────────────

describe('triggerBookingForMatch', () => {
  it('throws 404 when match not found', async () => {
    mockPrisma.match.findUnique.mockResolvedValue(null);

    await expect(triggerBookingForMatch('match1')).rejects.toThrow(AppError);
    await expect(triggerBookingForMatch('match1')).rejects.toThrow('Match not found');
  });

  it('warns and returns when a booking attempt already exists', async () => {
    const { logger } = await import('../../config/logger');
    mockPrisma.match.findUnique.mockResolvedValue(baseMatch);
    mockPrisma.bookingAttempt.findUnique.mockResolvedValue(baseAttempt);

    await triggerBookingForMatch('match1');

    expect(mockPrisma.bookingAttempt.create).not.toHaveBeenCalled();
    expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('already has a booking attempt'));
  });

  it('warns and returns when match has no host userId (no availability)', async () => {
    const { logger } = await import('../../config/logger');
    mockPrisma.match.findUnique.mockResolvedValue({ ...baseMatch, availability: null });
    mockPrisma.bookingAttempt.findUnique.mockResolvedValue(null);

    await triggerBookingForMatch('match1');

    expect(mockPrisma.bookingAttempt.create).not.toHaveBeenCalled();
    expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('No host userId'));
  });

  it('logs and returns when host has no active membership with password', async () => {
    const { logger } = await import('../../config/logger');
    mockPrisma.match.findUnique.mockResolvedValue(baseMatch);
    mockPrisma.bookingAttempt.findUnique.mockResolvedValue(null);
    mockPrisma.clubMembership.findFirst.mockResolvedValue(null);

    await triggerBookingForMatch('match1');

    expect(mockPrisma.bookingAttempt.create).not.toHaveBeenCalled();
    expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('no active club membership'));
  });

  it('creates pending attempt and fires booking job when conditions are met', async () => {
    mockPrisma.match.findUnique.mockResolvedValue(baseMatch);
    mockPrisma.bookingAttempt.findUnique.mockResolvedValue(null);
    mockPrisma.clubMembership.findFirst.mockResolvedValue(baseMembership);
    mockPrisma.bookingAttempt.create.mockResolvedValue({ ...baseAttempt, status: 'pending' });
    mockPrisma.schedulingRequest.findUnique.mockResolvedValue(null); // logBookingEvent silently skips
    // runBookingJob fires async — we just verify the attempt was created
    mockPrisma.match.findUnique
      .mockResolvedValueOnce(baseMatch) // triggerBookingForMatch lookup
      .mockResolvedValue(baseMatch);    // runBookingJob lookup (if it runs synchronously in test)

    await triggerBookingForMatch('match1');

    expect(mockPrisma.bookingAttempt.create).toHaveBeenCalledWith({
      data: { matchId: 'match1', clubMembershipId: 'mem1', status: 'pending' },
    });
  });
});

// ─── retryBookingForMatch ─────────────────────────────────────────

describe('retryBookingForMatch', () => {
  it('throws 404 when no booking attempt exists', async () => {
    mockPrisma.bookingAttempt.findUnique.mockResolvedValue(null);

    await expect(retryBookingForMatch('match1')).rejects.toThrow('No booking attempt found');
  });

  it('throws 409 when attempt is not in failed status', async () => {
    mockPrisma.bookingAttempt.findUnique.mockResolvedValue({ ...baseAttempt, status: 'success' });

    await expect(retryBookingForMatch('match1')).rejects.toThrow(AppError);
    await expect(retryBookingForMatch('match1')).rejects.toThrow(/Cannot retry/);
  });

  it('throws 409 for pending status', async () => {
    mockPrisma.bookingAttempt.findUnique.mockResolvedValue({ ...baseAttempt, status: 'pending' });

    await expect(retryBookingForMatch('match1')).rejects.toThrow(/Cannot retry/);
  });

  it('resets attempt to pending and fires job when status is failed', async () => {
    const failedAttempt = { ...baseAttempt, status: 'failed', errorMessage: 'timeout' };
    mockPrisma.bookingAttempt.findUnique.mockResolvedValue(failedAttempt);
    mockPrisma.bookingAttempt.update.mockResolvedValue({ ...failedAttempt, status: 'pending' });
    mockPrisma.schedulingRequest.findUnique.mockResolvedValue(null);

    await retryBookingForMatch('match1');

    expect(mockPrisma.bookingAttempt.update).toHaveBeenCalledWith({
      where: { id: 'attempt1' },
      data: { status: 'pending', errorMessage: null, completedAt: null },
    });
  });

  it('resets attemptedAt on retry so the timeout sentinel is refreshed', async () => {
    const failedAttempt = { ...baseAttempt, status: 'failed', errorMessage: 'timeout' };
    mockPrisma.bookingAttempt.findUnique.mockResolvedValue(failedAttempt);
    mockPrisma.bookingAttempt.update.mockResolvedValue({ ...failedAttempt, status: 'pending' });
    mockPrisma.schedulingRequest.findUnique.mockResolvedValue(null);

    const before = Date.now();
    await retryBookingForMatch('match1');
    const after = Date.now();

    const updateCall = mockPrisma.bookingAttempt.update.mock.calls[0][0];
    expect(updateCall.data.attemptedAt).toBeInstanceOf(Date);
    const resetAt = (updateCall.data.attemptedAt as Date).getTime();
    expect(resetAt).toBeGreaterThanOrEqual(before);
    expect(resetAt).toBeLessThanOrEqual(after);
  });
});

// ─── cancelBookingForMatch ────────────────────────────────────────

describe('cancelBookingForMatch', () => {
  it('throws 404 when no booking attempt exists', async () => {
    mockPrisma.bookingAttempt.findUnique.mockResolvedValue(null);

    await expect(cancelBookingForMatch('match1')).rejects.toThrow('No booking attempt found');
  });

  it('throws 409 when attempt status is not success', async () => {
    mockPrisma.bookingAttempt.findUnique.mockResolvedValue({ ...baseAttempt, status: 'pending' });

    await expect(cancelBookingForMatch('match1')).rejects.toThrow(AppError);
    await expect(cancelBookingForMatch('match1')).rejects.toThrow(/Cannot cancel/);
  });

  it('throws 400 when attempt has no externalBookingId', async () => {
    mockPrisma.bookingAttempt.findUnique.mockResolvedValue({
      ...baseAttempt,
      externalBookingId: null,
    });

    await expect(cancelBookingForMatch('match1')).rejects.toThrow('Booking has no external ID');
  });

  it('throws 400 when membership is missing or has no password', async () => {
    mockPrisma.bookingAttempt.findUnique.mockResolvedValue(baseAttempt);
    mockPrisma.clubMembership.findUnique.mockResolvedValue(null);

    await expect(cancelBookingForMatch('match1')).rejects.toThrow('Host membership missing');
  });

  it('throws 400 when membership has no encrypted password', async () => {
    mockPrisma.bookingAttempt.findUnique.mockResolvedValue(baseAttempt);
    mockPrisma.clubMembership.findUnique.mockResolvedValue({
      ...baseMembership,
      encryptedPassword: null,
    });

    await expect(cancelBookingForMatch('match1')).rejects.toThrow('Host membership missing');
  });

  it('marks attempt as cancelled even when adapter throws (reservation already gone)', async () => {
    const { logger } = await import('../../config/logger');
    mockPrisma.bookingAttempt.findUnique.mockResolvedValue(baseAttempt);
    mockPrisma.clubMembership.findUnique.mockResolvedValue(baseMembership);
    mockAdapter.cancel.mockRejectedValue(new Error('No reservation was found at the club'));
    mockPrisma.bookingAttempt.update.mockResolvedValue({ ...baseAttempt, status: 'cancelled' });
    mockPrisma.schedulingRequest.findUnique.mockResolvedValue(null);

    await cancelBookingForMatch('match1');

    expect(mockPrisma.bookingAttempt.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'cancelled' }),
      }),
    );
    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('Adapter cancel failed'),
      expect.anything(),
    );
  });

  it('cancels successfully via adapter and marks attempt cancelled', async () => {
    mockPrisma.bookingAttempt.findUnique.mockResolvedValue(baseAttempt);
    mockPrisma.clubMembership.findUnique.mockResolvedValue(baseMembership);
    mockAdapter.cancel.mockResolvedValue(undefined);
    mockPrisma.bookingAttempt.update.mockResolvedValue({ ...baseAttempt, status: 'cancelled' });
    mockPrisma.schedulingRequest.findUnique.mockResolvedValue(null);

    await cancelBookingForMatch('match1');

    expect(mockAdapter.cancel).toHaveBeenCalledWith(
      { socioNumber: '12345', password: 'secret' },
      'laieta::2026-03-15::10',
    );
    expect(mockPrisma.bookingAttempt.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'cancelled', errorMessage: null }),
      }),
    );
  });
});

// ─── getBookingAttemptByMatch ─────────────────────────────────────

describe('getBookingAttemptByMatch', () => {
  it('returns DTO when attempt found', async () => {
    mockPrisma.bookingAttempt.findUnique.mockResolvedValue(baseAttempt);

    const result = await getBookingAttemptByMatch('match1');

    expect(result).not.toBeNull();
    expect(result!.id).toBe('attempt1');
    expect(result!.status).toBe('success');
    expect(result!.courtName).toBe('Court 1');
    expect(typeof result!.attemptedAt).toBe('string');
  });

  it('returns null when no attempt exists', async () => {
    mockPrisma.bookingAttempt.findUnique.mockResolvedValue(null);

    const result = await getBookingAttemptByMatch('match1');

    expect(result).toBeNull();
  });
});
