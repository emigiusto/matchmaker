import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AppError } from '../../shared/errors/AppError';

// ------------------------------------------------------
// Prisma Mock (Vitest Hoisting-Safe — SAME PATTERN AS RESULTS TEST)
// ------------------------------------------------------

vi.mock('../../prisma', () => {
  const mockTx = {
    invite: { findUnique: vi.fn(), update: vi.fn(), create: vi.fn() },
    availability: { findUnique: vi.fn() },
    user: { findUnique: vi.fn() },
    player: { findFirst: vi.fn() },
    match: { create: vi.fn() },
  };

  const mockPrisma: any = {
    ...mockTx,
    $transaction: vi.fn(async (fn: any) => fn(mockTx)),
    __mockTx: mockTx,
  };

  return {
    prisma: mockPrisma,
  };
});

// IMPORTANT: Import AFTER vi.mock
import { prisma } from '../../prisma';
import { InviteService } from './invite.service';

const mockPrisma = prisma as any;
const mockTx = mockPrisma.__mockTx;

// Mock notification side effect
vi.mock('../notifications/notifications.service', () => ({
  createNotification: vi.fn().mockResolvedValue(undefined),
}));

// Mock markAvailabilityAsMatched side effect
vi.mock('../availabilities/availability.service', () => ({
  AvailabilityService: {
    markAvailabilityAsMatched: vi.fn().mockResolvedValue(undefined),
  },
}));

// ------------------------------------------------------
// Base Fixtures
// ------------------------------------------------------

const baseInvite = {
  id: 'invite1',
  token: 'token1',
  status: 'pending',
  expiresAt: new Date(Date.now() + 100000),
  availabilityId: 'avail1',
  inviterUserId: 'userA',
  matchType: 'competitive',
};

const baseAvailability = {
  id: 'avail1',
  userId: 'userA',
  startTime: new Date(),
};

const baseUser = { id: 'userB' };

// ------------------------------------------------------
// Test Suite
// ------------------------------------------------------

describe('InviteService.matchType propagation', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    Object.values(mockTx).forEach(group =>
      Object.values(group as Record<string, any>).forEach(
        (fn: any) => fn.mockReset?.()
      )
    );
  });

  it('creates a match with type competitive from invite', async () => {
    mockTx.invite.findUnique.mockResolvedValueOnce({
      ...baseInvite,
      matchType: 'competitive',
    });

    mockTx.availability.findUnique.mockResolvedValueOnce(baseAvailability);

    mockTx.user.findUnique.mockResolvedValueOnce(baseUser);

    mockTx.player.findFirst.mockResolvedValue(null);

    mockTx.match.create.mockResolvedValueOnce({
      id: 'match1',
      type: 'competitive',
    });

    mockTx.invite.update.mockResolvedValueOnce({
      ...baseInvite,
      status: 'accepted',
      matchType: 'competitive',
      match: { id: 'match1', type: 'competitive' },
    });

    const dto = await InviteService.confirmInvite('token1', 'userB');

    expect(mockTx.match.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          type: 'competitive',
        }),
      })
    );

    expect(dto.matchType).toBe('competitive');
  });

  it('creates a match with type practice from invite', async () => {
    mockTx.invite.findUnique.mockResolvedValueOnce({
      ...baseInvite,
      token: 'token2',
      matchType: 'practice',
    });

    mockTx.availability.findUnique.mockResolvedValueOnce({
      ...baseAvailability,
      id: 'avail2',
    });

    mockTx.user.findUnique.mockResolvedValueOnce(baseUser);

    mockTx.player.findFirst.mockResolvedValue(null);

    mockTx.match.create.mockResolvedValueOnce({
      id: 'match2',
      type: 'practice',
    });

    mockTx.invite.update.mockResolvedValueOnce({
      ...baseInvite,
      id: 'invite2',
      token: 'token2',
      status: 'accepted',
      matchType: 'practice',
      match: { id: 'match2', type: 'practice' },
    });

    const dto = await InviteService.confirmInvite('token2', 'userB');

    expect(mockTx.match.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          type: 'practice',
        }),
      })
    );

    expect(dto.matchType).toBe('practice');
  });
});
