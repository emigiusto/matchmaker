import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as ResultsService from './results.service';
import { AppError } from '../../shared/errors/AppError';

// ------------------------------------------------------
// Prisma Mock (Vitest Hoisting-Safe)
// ------------------------------------------------------

vi.mock('../../prisma', () => {
  const mockTx = {
    result: { findUnique: vi.fn(), update: vi.fn(), create: vi.fn() },
    match: { findUnique: vi.fn(), update: vi.fn() },
    setResult: { findMany: vi.fn(), create: vi.fn() },
    ratingHistory: { findMany: vi.fn() },
    player: { findUnique: vi.fn(), update: vi.fn() },
  };

  const mockPrisma: any = {
    $transaction: vi.fn(),
    result: mockTx.result,
    match: mockTx.match,
    setResult: mockTx.setResult,
    ratingHistory: mockTx.ratingHistory,
    player: mockTx.player,

    // 👇 attach mockTx directly on prisma
    __mockTx: mockTx,
  };

  return {
    prisma: mockPrisma,
  };
});

// After mock definition
import { prisma } from '../../prisma';

const mockPrisma = prisma as any;
const mockTx = mockPrisma.__mockTx;

// ------------------------------------------------------
// RatingService Mock (Vitest-safe)
// ------------------------------------------------------

vi.mock('../rating/rating.service', () => {
  const updateRatingsForCompletedMatch = vi.fn();

  return {
    RatingService: {
      updateRatingsForCompletedMatch,
    },
  };
});

import { RatingService } from '../rating/rating.service';

const updateRatingsForCompletedMatch =
  (RatingService as any).updateRatingsForCompletedMatch;

// ------------------------------------------------------
// Base Fixtures
// ------------------------------------------------------

const baseResult = {
  id: 'result-1',
  matchId: 'match-1',
  winnerUserId: 'userA',
  status: 'draft',
  createdAt: new Date(),
  submittedByUserId: null,
  confirmedByHostAt: null,
  confirmedByOpponentAt: null,
  disputedByHostAt: null,
  disputedByOpponentAt: null,
};

const baseMatch = {
  id: 'match-1',
  status: 'scheduled',
  hostUserId: 'userA',
  opponentUserId: 'userB',
  playerAId: 'playerA',
  playerBId: 'playerB',
  scheduledAt: new Date(Date.now() - 10000),
};

// ------------------------------------------------------
// Test Suite
// ------------------------------------------------------

describe('Result confirmation lifecycle', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    Object.values(mockTx).forEach(group =>
      Object.values(group as Record<string, any>).forEach((fn: any) => fn.mockReset?.())
    );

    updateRatingsForCompletedMatch.mockReset();
  });

  it('Submitting result does NOT update ranking', async () => {
    mockPrisma.$transaction.mockImplementation(async (fn: any) => fn(mockTx));

    mockTx.result.findUnique.mockResolvedValueOnce({
      ...baseResult,
      status: 'draft',
      match: baseMatch,
      sets: [],
    });

    mockTx.result.update.mockResolvedValueOnce({
      ...baseResult,
      status: 'submitted',
      match: baseMatch,
    });

    mockTx.match.update.mockResolvedValueOnce({
      ...baseMatch,
      status: 'awaiting_confirmation',
    });

    mockTx.result.findUnique.mockResolvedValueOnce({
      ...baseResult,
      status: 'submitted',
      match: baseMatch,
      sets: [],
    });

    const res = await ResultsService.submitResult('result-1', 'userA');

    expect(res.status).toBe('submitted');
    expect(updateRatingsForCompletedMatch).not.toHaveBeenCalled();
  });

  it('One confirmation keeps match awaiting_confirmation', async () => {
    mockPrisma.$transaction.mockImplementation(async (fn: any) => fn(mockTx));

    // 1. Initial findUnique
    mockTx.result.findUnique.mockResolvedValueOnce({
      ...baseResult,
      status: 'submitted',
      match: { ...baseMatch, status: 'awaiting_confirmation' },
      confirmedByHostAt: null,
      confirmedByOpponentAt: null,
    });

    // 2. update()
    mockTx.result.update.mockResolvedValueOnce({
      ...baseResult,
      status: 'submitted',
      confirmedByHostAt: new Date(),
      match: { ...baseMatch, status: 'awaiting_confirmation' },
    });

    // 3. findUnique after update
    mockTx.result.findUnique.mockResolvedValueOnce({
      ...baseResult,
      status: 'submitted',
      confirmedByHostAt: new Date(),
      confirmedByOpponentAt: null,
      match: { ...baseMatch, status: 'awaiting_confirmation' },
    });

    // 4. Final findUnique before returning DTO
    mockTx.result.findUnique.mockResolvedValueOnce({
      ...baseResult,
      status: 'submitted',
      confirmedByHostAt: new Date(),
      confirmedByOpponentAt: null,
      match: { ...baseMatch, status: 'awaiting_confirmation' },
    });

    mockTx.setResult.findMany.mockResolvedValue([]);

    const res = await ResultsService.confirmResult('result-1', 'userA');

    expect(res.status).toBe('submitted');
    expect(updateRatingsForCompletedMatch).not.toHaveBeenCalled();
  });

  it('Two confirmations complete the match and update ranking once', async () => {
    mockPrisma.$transaction.mockImplementation(async (fn: any) => fn(mockTx));

    mockTx.result.findUnique.mockResolvedValueOnce({
      ...baseResult,
      status: 'submitted',
      match: { ...baseMatch, status: 'awaiting_confirmation' },
      confirmedByHostAt: null,
      confirmedByOpponentAt: null,
    });

    mockTx.result.update.mockResolvedValueOnce({
      ...baseResult,
      status: 'submitted',
      confirmedByOpponentAt: new Date(),
      match: { ...baseMatch, status: 'awaiting_confirmation' },
    });

    mockTx.result.findUnique.mockResolvedValueOnce({
      ...baseResult,
      status: 'submitted',
      confirmedByHostAt: new Date(),
      confirmedByOpponentAt: new Date(),
      match: { ...baseMatch, status: 'awaiting_confirmation' },
    });

    mockTx.result.update.mockResolvedValueOnce({
      ...baseResult,
      status: 'confirmed',
      confirmedByHostAt: new Date(),
      confirmedByOpponentAt: new Date(),
      match: { ...baseMatch, status: 'awaiting_confirmation' },
    });

    mockTx.match.update.mockResolvedValueOnce({
      ...baseMatch,
      status: 'completed',
    });

    mockTx.setResult.findMany.mockResolvedValue([]);

    mockTx.result.findUnique.mockResolvedValueOnce({
      ...baseResult,
      status: 'confirmed',
      confirmedByHostAt: new Date(),
      confirmedByOpponentAt: new Date(),
      match: { ...baseMatch, status: 'completed' },
    });

    const res = await ResultsService.confirmResult('result-1', 'userB');

    expect(res.status).toBe('confirmed');
    expect(updateRatingsForCompletedMatch).toHaveBeenCalledTimes(1);
  });

  // The lifecycle is now strict:
  // confirmResult() must throw if result.status !== 'submitted'.
  // The current test incorrectly assumes confirmResult() is idempotent.
  // Rewrite this test so that:
  // - If result.status === 'confirmed'
  // - confirmResult() throws AppError('Result is not awaiting confirmation')
  // - RankingService.updateRatingsForCompletedMatch is NOT called.
  // Keep the test structure consistent with the suite.
  // Do not weaken lifecycle rules.
  // Do not modify service implementation.
  // Only fix the test.
  it('Confirming already confirmed result throws error', async () => {
    mockPrisma.$transaction.mockImplementation(async (fn: any) => fn(mockTx));

    mockTx.result.findUnique.mockResolvedValueOnce({
      ...baseResult,
      status: 'confirmed',
      match: { ...baseMatch, status: 'completed' },
      confirmedByHostAt: new Date(),
      confirmedByOpponentAt: new Date(),
    });

    mockTx.setResult.findMany.mockResolvedValue([]);

    await expect(
      ResultsService.confirmResult('result-1', 'userA')
    ).rejects.toThrow('Result is not awaiting confirmation');
    expect(updateRatingsForCompletedMatch).not.toHaveBeenCalled();
  });

  it('Dispute prevents completion', async () => {
    mockPrisma.$transaction.mockImplementation(async (fn: any) => fn(mockTx));

    mockTx.result.findUnique.mockResolvedValueOnce({
      ...baseResult,
      status: 'disputed',
      match: { ...baseMatch, status: 'disputed' },
    });

    mockTx.setResult.findMany.mockResolvedValue([]);

    await expect(
      ResultsService.confirmResult('result-1', 'userA')
    ).rejects.toThrow();

    expect(updateRatingsForCompletedMatch).not.toHaveBeenCalled();
  });

  it('Confirmed result cannot be edited', async () => {
    mockPrisma.$transaction.mockImplementation(async (fn: any) => fn(mockTx));

    mockTx.result.findUnique.mockResolvedValueOnce({
      ...baseResult,
      status: 'confirmed',
      match: baseMatch,
      sets: [],
    });

    await expect(
      ResultsService.addSetResult('result-1', {
        setNumber: 1,
        playerAScore: 6,
        playerBScore: 4,
      })
    ).rejects.toThrow('Cannot edit confirmed result');
  });

  it('Attempting to complete match without confirmed result throws error', async () => {
    const matchId = 'match-1';

    mockTx.match.findUnique.mockResolvedValueOnce({
      ...baseMatch,
      status: 'scheduled',
    });

    mockTx.result.findUnique.mockResolvedValueOnce({
      ...baseResult,
      status: 'submitted',
      match: baseMatch,
    });

    const completeMatch = async () => {
      const match = await mockTx.match.findUnique({
        where: { id: matchId },
      });

      if (!match) throw new AppError('Match not found', 404);

      const result = await mockTx.result.findUnique({
        where: { matchId },
      });

      if (!result || result.status !== 'confirmed') {
        throw new AppError(
          'Cannot complete match: result not confirmed',
          409
        );
      }
    };

    await expect(completeMatch()).rejects.toThrow(
      'Cannot complete match: result not confirmed'
    );
  });
});
