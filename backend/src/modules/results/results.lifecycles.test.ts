import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as ResultsService from './results.service';
import { AppError } from '../../shared/errors/AppError';

// ------------------------------------------------------
// Prisma Mock (Vitest Hoisting-Safe)
// ------------------------------------------------------

vi.mock('../../prisma', () => {
  const mockTx = {
    result: { findUnique: vi.fn(), findMany: vi.fn(), update: vi.fn(), create: vi.fn() },
    match: { findUnique: vi.fn(), update: vi.fn() },
    setResult: { findMany: vi.fn(), create: vi.fn() },
    ratingHistory: { findMany: vi.fn() },
    player: { findUnique: vi.fn(), findFirst: vi.fn(), update: vi.fn() },
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

vi.mock('../notifications/notifications.service', () => ({
  createNotification: vi.fn().mockResolvedValue(undefined),
}));

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
  playerAId: 'playerA',
  playerBId: 'playerB',
  scheduledAt: new Date(Date.now() - 10000),
  type: 'competitive',
};

const baseMatchWithParticipants = (overrides: Record<string, any> = {}) => ({
  ...baseMatch,
  participants: [
    { userId: 'userA', team: 'A' as const },
    { userId: 'userB', team: 'B' as const },
  ],
  ...overrides,
});

// ------------------------------------------------------
// Test Suite
// ------------------------------------------------------

describe('Result confirmation lifecycle', () => {
    it('Disputed result blocks confirmation and ranking', async () => {
      mockPrisma.$transaction.mockImplementation(async (fn: any) => fn(mockTx));

      mockTx.result.findUnique.mockResolvedValueOnce({
        ...baseResult,
        status: 'disputed',
        match: baseMatchWithParticipants({ status: 'disputed' }),
        confirmedByHostAt: null,
        confirmedByOpponentAt: null,
      });

      mockTx.setResult.findMany.mockResolvedValue([]);

      await expect(
        ResultsService.confirmResult('result-1', 'userA')
      ).rejects.toThrow('Cannot confirm a disputed result');
      expect(updateRatingsForCompletedMatch).not.toHaveBeenCalled();
    });

    it('Disputed match blocks completion and ranking', async () => {
      mockPrisma.$transaction.mockImplementation(async (fn: any) => fn(mockTx));

      mockTx.match.findUnique.mockResolvedValueOnce(
        baseMatchWithParticipants({ status: 'disputed' })
      );

      await expect(
        ResultsService.confirmResult('result-1', 'userA')
      ).rejects.toThrow();
      expect(updateRatingsForCompletedMatch).not.toHaveBeenCalled();
    });

    it('updateRatingsForCompletedMatch does not run for disputed or unconfirmed', async () => {
      // Simulate the static method directly
      const tx = mockPrisma;
      // Disputed match
      mockTx.match.findUnique.mockResolvedValueOnce({ ...baseMatch, status: 'disputed' });
      mockTx.result.findUnique.mockResolvedValueOnce({ ...baseResult, status: 'disputed', winnerUserId: 'userA' });
      const result1 = await RatingService.updateRatingsForCompletedMatch(tx, baseMatch.id);
      expect(result1).toBeUndefined();

      // Not confirmed
      mockTx.match.findUnique.mockResolvedValueOnce({ ...baseMatch, status: 'completed' });
      mockTx.result.findUnique.mockResolvedValueOnce({ ...baseResult, status: 'submitted', winnerUserId: 'userA' });
      const result2 = await RatingService.updateRatingsForCompletedMatch(tx, baseMatch.id);
      expect(result2).toBeUndefined();
    });
  beforeEach(() => {
    vi.clearAllMocks();

    Object.values(mockTx).forEach(group =>
      Object.values(group as Record<string, any>).forEach((fn: any) => fn.mockReset?.())
    );

    updateRatingsForCompletedMatch.mockReset();
  });



  it('One confirmation keeps match awaiting_confirmation', async () => {
    mockPrisma.$transaction.mockImplementation(async (fn: any) => fn(mockTx));

    // 1. Initial findUnique
    mockTx.result.findUnique.mockResolvedValueOnce({
      ...baseResult,
      status: 'submitted',
      match: baseMatchWithParticipants({ status: 'awaiting_confirmation' }),
      confirmedByHostAt: null,
      confirmedByOpponentAt: null,
    });

    // 2. update()
    mockTx.result.update.mockResolvedValueOnce({
      ...baseResult,
      status: 'submitted',
      confirmedByHostAt: new Date(),
      match: baseMatchWithParticipants({ status: 'awaiting_confirmation' }),
    });

    // 3. findUnique after update
    mockTx.result.findUnique.mockResolvedValueOnce({
      ...baseResult,
      status: 'submitted',
      confirmedByHostAt: new Date(),
      confirmedByOpponentAt: null,
      match: baseMatchWithParticipants({ status: 'awaiting_confirmation' }),
    });

    // 4. Final findUnique before returning DTO
    mockTx.result.findUnique.mockResolvedValueOnce({
      ...baseResult,
      status: 'submitted',
      confirmedByHostAt: new Date(),
      confirmedByOpponentAt: null,
      match: baseMatchWithParticipants({ status: 'awaiting_confirmation' }),
    });

    mockTx.setResult.findMany.mockResolvedValue([]);

    const res = await ResultsService.confirmResult('result-1', 'userA');

    expect(res.status).toBe('submitted');
    expect(updateRatingsForCompletedMatch).not.toHaveBeenCalled();
  });

  it('Two confirmations complete the match and update ranking once', async () => {
    mockPrisma.$transaction.mockImplementation(async (fn: any) => fn(mockTx));

    mockTx.player.findFirst
      .mockResolvedValueOnce({ id: 'playerA', userId: 'userA' })
      .mockResolvedValueOnce({ id: 'playerB', userId: 'userB' });

    // 1. Initial findUnique (before any confirmation)
    mockTx.result.findUnique.mockResolvedValueOnce({
      ...baseResult,
      status: 'submitted',
      match: baseMatchWithParticipants({ status: 'awaiting_confirmation' }),
      confirmedByHostAt: null,
      confirmedByOpponentAt: null,
    });
    // 2. update() for confirmation
    mockTx.result.update.mockResolvedValueOnce({
      ...baseResult,
      status: 'submitted',
      confirmedByOpponentAt: new Date(),
      match: baseMatchWithParticipants({ status: 'awaiting_confirmation' }),
    });
    // 3. findUnique after update (both confirmed)
    mockTx.result.findUnique.mockResolvedValueOnce({
      ...baseResult,
      status: 'submitted',
      confirmedByHostAt: new Date(),
      confirmedByOpponentAt: new Date(),
      match: baseMatchWithParticipants({ status: 'awaiting_confirmation' }),
    });
    // 4. update() to set status to confirmed
    mockTx.result.update.mockResolvedValueOnce({
      ...baseResult,
      status: 'confirmed',
      confirmedByHostAt: new Date(),
      confirmedByOpponentAt: new Date(),
      match: baseMatchWithParticipants({ status: 'awaiting_confirmation' }),
    });
    // 5. update() to set match to completed (with playerAId, playerBId)
    mockTx.match.update.mockResolvedValueOnce({
      ...baseMatch,
      status: 'completed',
      playerAId: 'playerA',
      playerBId: 'playerB',
    });
    // 6. setResult.findMany
    mockTx.setResult.findMany.mockResolvedValue([]);
    // 7. findUnique for finalResult (after all updates)
    const finalConfirmedResult = {
      ...baseResult,
      status: 'confirmed',
      confirmedByHostAt: new Date(),
      confirmedByOpponentAt: new Date(),
      match: baseMatchWithParticipants({ status: 'completed' }),
    };
    mockTx.result.findUnique.mockResolvedValueOnce(finalConfirmedResult);
    // 8. findUnique for finalMatch (after all updates)
    mockTx.match.findUnique.mockResolvedValueOnce(
      baseMatchWithParticipants({ status: 'completed' })
    );
    // 9. findUnique for finalResult (for return value)
    mockTx.result.findUnique.mockResolvedValueOnce(finalConfirmedResult);
    const res = await ResultsService.confirmResult('result-1', 'userB');
    expect(res.status).toBe('confirmed');
    expect(updateRatingsForCompletedMatch).toHaveBeenCalledTimes(1);
  });

  it('Double confirmation is idempotent and does not duplicate ranking', async () => {
    mockPrisma.$transaction.mockImplementation(async (fn: any) => fn(mockTx));
    mockTx.player.findFirst
      .mockResolvedValueOnce({ id: 'playerA', userId: 'userA' })
      .mockResolvedValueOnce({ id: 'playerB', userId: 'userB' });
    // Sequence all result.findUnique calls to match service expectations:
    // 1. submitted/awaiting_confirmation (first confirmation)
    // 2. confirmed/completed (after confirmation)
    // 3. confirmed/completed (idempotency check)
    // 4. confirmed/completed (idempotency check)
      const confirmedResult = {
        ...baseResult,
        status: 'confirmed',
        match: baseMatchWithParticipants({ status: 'completed' }),
        confirmedByHostAt: new Date(),
        confirmedByOpponentAt: new Date(),
      };
      mockTx.result.findUnique
        .mockResolvedValueOnce({
          ...baseResult,
          status: 'submitted',
          match: baseMatchWithParticipants({ status: 'awaiting_confirmation' }),
          confirmedByHostAt: new Date(),
          confirmedByOpponentAt: null,
        })
        .mockResolvedValueOnce(confirmedResult)
        .mockResolvedValueOnce(confirmedResult)
        .mockResolvedValueOnce(confirmedResult)
        // Fallback for any further calls
        .mockResolvedValue(confirmedResult);
    mockTx.setResult.findMany.mockResolvedValue([]);
    mockTx.result.update.mockResolvedValue({
      ...baseResult,
      status: 'confirmed',
      match: baseMatchWithParticipants({ status: 'completed' }),
      confirmedByHostAt: new Date(),
      confirmedByOpponentAt: new Date(),
    });
    mockTx.match.update.mockResolvedValue(baseMatchWithParticipants({ status: 'completed' }));
    updateRatingsForCompletedMatch.mockResolvedValue(undefined);

    // Add missing match.findUnique mocks for final lifecycle check
    mockTx.match.findUnique
      .mockResolvedValueOnce(baseMatchWithParticipants({ status: 'completed' }))
      .mockResolvedValueOnce(baseMatchWithParticipants({ status: 'completed' }));

    // First confirmation (should trigger ranking)
    await ResultsService.confirmResult('result-1', 'userB');
    expect(updateRatingsForCompletedMatch).toHaveBeenCalledTimes(1);

    // Second confirmation (should be idempotent, not trigger ranking again)
    await ResultsService.confirmResult('result-1', 'userB');
    expect(updateRatingsForCompletedMatch).toHaveBeenCalledTimes(1);
  });

  it('Dispute prevents completion', async () => {
    mockPrisma.$transaction.mockImplementation(async (fn: any) => fn(mockTx));

    mockTx.result.findUnique.mockResolvedValueOnce({
      ...baseResult,
      status: 'disputed',
      match: baseMatchWithParticipants({ status: 'disputed' }),
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
      match: baseMatchWithParticipants(),
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
      match: baseMatchWithParticipants(),
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

// ------------------------------------------------------
// Self-confirmation guard
// ------------------------------------------------------

describe('confirmResult() — self-confirmation guard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.values(mockTx).forEach(group =>
      Object.values(group as Record<string, any>).forEach((fn: any) => fn.mockReset?.())
    );
    updateRatingsForCompletedMatch.mockReset();
  });

  it('Submitter cannot self-confirm their own result', async () => {
    mockPrisma.$transaction.mockImplementation(async (fn: any) => fn(mockTx));

    mockTx.result.findUnique.mockResolvedValueOnce({
      ...baseResult,
      status: 'submitted',
      submittedByUserId: 'userA',
      match: baseMatchWithParticipants({ status: 'awaiting_confirmation' }),
    });

    await expect(
      ResultsService.confirmResult('result-1', 'userA')
    ).rejects.toThrow('submitter cannot provide the second confirmation');
    expect(updateRatingsForCompletedMatch).not.toHaveBeenCalled();
  });

  it('Opponent (non-submitter) can confirm', async () => {
    mockPrisma.$transaction.mockImplementation(async (fn: any) => fn(mockTx));

    mockTx.result.findUnique
      .mockResolvedValueOnce({
        ...baseResult,
        status: 'submitted',
        submittedByUserId: 'userA',
        match: baseMatchWithParticipants({ status: 'awaiting_confirmation' }),
        confirmedByHostAt: null,
        confirmedByOpponentAt: null,
      })
      .mockResolvedValueOnce({
        ...baseResult,
        status: 'submitted',
        submittedByUserId: 'userA',
        confirmedByOpponentAt: new Date(),
        confirmedByHostAt: null,
        match: baseMatchWithParticipants({ status: 'awaiting_confirmation' }),
      })
      .mockResolvedValue({
        ...baseResult,
        status: 'submitted',
        submittedByUserId: 'userA',
        confirmedByOpponentAt: new Date(),
        confirmedByHostAt: null,
        match: baseMatchWithParticipants({ status: 'awaiting_confirmation' }),
      });

    mockTx.result.update.mockResolvedValue({});
    mockTx.setResult.findMany.mockResolvedValue([]);

    const res = await ResultsService.confirmResult('result-1', 'userB');
    expect(res.status).toBe('submitted'); // only one side confirmed
  });
});

// ------------------------------------------------------
// disputeResult()
// ------------------------------------------------------

describe('disputeResult()', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.values(mockTx).forEach(group =>
      Object.values(group as Record<string, any>).forEach((fn: any) => fn.mockReset?.())
    );
    updateRatingsForCompletedMatch.mockReset();
  });

  const submittedResultWithParticipants = () => ({
    ...baseResult,
    status: 'submitted',
    disputeNote: null,
    sets: [],
    match: {
      ...baseMatchWithParticipants({ status: 'awaiting_confirmation' }),
      participants: [
        { userId: 'userA', team: 'A' as const },
        { userId: 'userB', team: 'B' as const },
      ],
    },
  });

  it('Participant can dispute a submitted result and note is stored', async () => {
    mockPrisma.$transaction.mockImplementation(async (fn: any) => fn(mockTx));

    mockTx.result.findUnique
      .mockResolvedValueOnce(submittedResultWithParticipants())
      .mockResolvedValueOnce({ ...baseResult, status: 'disputed', disputeNote: 'wrong score', sets: [] });

    mockTx.result.update.mockResolvedValueOnce({});
    mockTx.match.update.mockResolvedValueOnce({});

    const res = await ResultsService.disputeResult({
      resultId: 'result-1',
      userId: 'userA',
      isAdmin: false,
      disputeNote: 'wrong score',
    });

    expect(mockTx.result.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'disputed', disputeNote: 'wrong score' }) })
    );
    expect(mockTx.match.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: 'disputed' } })
    );
    expect(res.status).toBe('disputed');
    expect(res.disputeNote).toBe('wrong score');
  });

  it('Non-participant cannot dispute', async () => {
    mockPrisma.$transaction.mockImplementation(async (fn: any) => fn(mockTx));

    mockTx.result.findUnique.mockResolvedValueOnce(submittedResultWithParticipants());

    await expect(
      ResultsService.disputeResult({ resultId: 'result-1', userId: 'outsider', isAdmin: false })
    ).rejects.toThrow('Only match participants or admins can dispute a result');
  });

  it('Admin can dispute even as non-participant', async () => {
    mockPrisma.$transaction.mockImplementation(async (fn: any) => fn(mockTx));

    mockTx.result.findUnique
      .mockResolvedValueOnce(submittedResultWithParticipants())
      .mockResolvedValueOnce({ ...baseResult, status: 'disputed', disputeNote: null, sets: [] });

    mockTx.result.update.mockResolvedValueOnce({});
    mockTx.match.update.mockResolvedValueOnce({});

    const res = await ResultsService.disputeResult({
      resultId: 'result-1',
      userId: 'adminUser',
      isAdmin: true,
    });

    expect(res.status).toBe('disputed');
  });

  it('Cannot dispute an already-confirmed result', async () => {
    mockPrisma.$transaction.mockImplementation(async (fn: any) => fn(mockTx));

    mockTx.result.findUnique.mockResolvedValueOnce({
      ...baseResult,
      status: 'confirmed',
      sets: [],
      match: baseMatchWithParticipants({ status: 'completed' }),
    });

    await expect(
      ResultsService.disputeResult({ resultId: 'result-1', userId: 'userA', isAdmin: false })
    ).rejects.toThrow('Cannot dispute a confirmed result');
  });

  it('disputeNote defaults to null when not provided', async () => {
    mockPrisma.$transaction.mockImplementation(async (fn: any) => fn(mockTx));

    mockTx.result.findUnique
      .mockResolvedValueOnce(submittedResultWithParticipants())
      .mockResolvedValueOnce({ ...baseResult, status: 'disputed', disputeNote: null, sets: [] });

    mockTx.result.update.mockResolvedValueOnce({});
    mockTx.match.update.mockResolvedValueOnce({});

    await ResultsService.disputeResult({ resultId: 'result-1', userId: 'userA', isAdmin: false });

    expect(mockTx.result.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ disputeNote: null }) })
    );
  });
});

// ------------------------------------------------------
// autoConfirmResults()
// ------------------------------------------------------

describe('autoConfirmResults()', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.values(mockTx).forEach(group =>
      Object.values(group as Record<string, any>).forEach((fn: any) => fn.mockReset?.())
    );
    updateRatingsForCompletedMatch.mockReset();
  });

  const oldSubmittedResult = (id: string, matchType = 'competitive') => ({
    id,
    matchId: `match-${id}`,
    status: 'submitted',
    winnerUserId: 'userA',
    submittedByUserId: 'userA',
    createdAt: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000), // 8 days old
    confirmedByHostAt: null,
    confirmedByOpponentAt: null,
    disputedByHostAt: null,
    disputedByOpponentAt: null,
    disputeNote: null,
    match: { ...baseMatch, id: `match-${id}`, type: matchType, participants: [] },
  });

  it('Returns count of auto-confirmed results', async () => {
    mockPrisma.result.findMany.mockResolvedValueOnce([
      oldSubmittedResult('r1'),
      oldSubmittedResult('r2'),
    ]);
    mockPrisma.$transaction.mockImplementation(async (fn: any) => fn(mockTx));
    mockTx.result.update.mockResolvedValue({});
    mockTx.match.update.mockResolvedValue({});
    updateRatingsForCompletedMatch.mockResolvedValue(undefined);

    const count = await ResultsService.autoConfirmResults();
    expect(count).toBe(2);
  });

  it('Sets confirmed status and match to completed', async () => {
    mockPrisma.result.findMany.mockResolvedValueOnce([oldSubmittedResult('r1')]);
    mockPrisma.$transaction.mockImplementation(async (fn: any) => fn(mockTx));
    mockTx.result.update.mockResolvedValueOnce({});
    mockTx.match.update.mockResolvedValueOnce({});
    updateRatingsForCompletedMatch.mockResolvedValue(undefined);

    await ResultsService.autoConfirmResults();

    expect(mockTx.result.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'confirmed' }) })
    );
    expect(mockTx.match.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: 'completed' } })
    );
  });

  it('Calls updateRatingsForCompletedMatch for competitive matches', async () => {
    mockPrisma.result.findMany.mockResolvedValueOnce([oldSubmittedResult('r1', 'competitive')]);
    mockPrisma.$transaction.mockImplementation(async (fn: any) => fn(mockTx));
    mockTx.result.update.mockResolvedValue({});
    mockTx.match.update.mockResolvedValue({});
    updateRatingsForCompletedMatch.mockResolvedValue(undefined);

    await ResultsService.autoConfirmResults();
    expect(updateRatingsForCompletedMatch).toHaveBeenCalledTimes(1);
  });

  it('Does not call updateRatingsForCompletedMatch for practice matches', async () => {
    mockPrisma.result.findMany.mockResolvedValueOnce([oldSubmittedResult('r1', 'practice')]);
    mockPrisma.$transaction.mockImplementation(async (fn: any) => fn(mockTx));
    mockTx.result.update.mockResolvedValue({});
    mockTx.match.update.mockResolvedValue({});

    await ResultsService.autoConfirmResults();
    expect(updateRatingsForCompletedMatch).not.toHaveBeenCalled();
  });

  it('Returns 0 when no results are old enough', async () => {
    mockPrisma.result.findMany.mockResolvedValueOnce([]);

    const count = await ResultsService.autoConfirmResults();
    expect(count).toBe(0);
    expect(updateRatingsForCompletedMatch).not.toHaveBeenCalled();
  });

  it('Continues processing remaining results if one fails', async () => {
    mockPrisma.result.findMany.mockResolvedValueOnce([
      oldSubmittedResult('r1'),
      oldSubmittedResult('r2'),
    ]);
    mockPrisma.$transaction
      .mockRejectedValueOnce(new Error('DB error on r1'))
      .mockImplementationOnce(async (fn: any) => fn(mockTx));
    mockTx.result.update.mockResolvedValue({});
    mockTx.match.update.mockResolvedValue({});
    updateRatingsForCompletedMatch.mockResolvedValue(undefined);

    const count = await ResultsService.autoConfirmResults();
    expect(count).toBe(1); // r1 failed, r2 succeeded
  });
});
