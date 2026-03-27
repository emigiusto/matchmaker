import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AppError } from '../../../shared/errors/AppError';

// ── Prisma Mock ──────────────────────────────────────────────────────────────
vi.mock('../../../prisma', () => {
  const mockTx = {
    match: { findUnique: vi.fn(), update: vi.fn() },
    result: { findUnique: vi.fn(), create: vi.fn() },
    setResult: { create: vi.fn() },
    matchParticipant: { updateMany: vi.fn() },
    ratingHistory: { findMany: vi.fn() },
    player: { findUnique: vi.fn(), update: vi.fn() },
  };
  const mockPrisma: any = {
    $transaction: vi.fn(),
    ...mockTx,
    __mockTx: mockTx,
  };
  return { prisma: mockPrisma };
});

vi.mock('../../rating/rating.service', () => ({
  RatingService: { updateRatingsForCompletedMatch: vi.fn() },
}));
vi.mock('../../notifications/notifications.service', () => ({
  createNotification: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('../../whatsapp/whatsapp.service', () => ({
  whatsappService: { sendTextMessage: vi.fn(), sendGroupMessage: vi.fn() },
}));
vi.mock('../../../lib/whatsapp-messages', () => ({
  getMessages: vi.fn().mockReturnValue({}),
}));
vi.mock('../../../config/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { prisma } from '../../../prisma';
import * as ResultsService from '../results.service';

const mockPrisma = prisma as any;
const mockTx = mockPrisma.__mockTx;

// ── Fixtures ─────────────────────────────────────────────────────────────────

const MATCH_ID = 'match-1';
const RESULT_ID = 'result-1';
const USER_A = 'user-a';
const USER_B = 'user-b';

function makeMatch(overrides: Record<string, any> = {}) {
  return {
    id: MATCH_ID,
    status: 'scheduled',
    type: 'competitive',
    participants: [
      { userId: USER_A, team: 'A' },
      { userId: USER_B, team: 'B' },
    ],
    playerA: { userId: USER_A },
    playerB: { userId: USER_B },
    ...overrides,
  };
}

function makeResultWithSets(overrides: Record<string, any> = {}) {
  return {
    id: RESULT_ID,
    matchId: MATCH_ID,
    winnerUserId: USER_A,
    submittedByUserId: USER_A,
    status: 'submitted',
    createdAt: new Date('2026-01-01'),
    confirmedByHostAt: new Date('2026-01-01'),
    confirmedByOpponentAt: null,
    disputedByHostAt: null,
    disputedByOpponentAt: null,
    disputeNote: null,
    questionnaire: null,
    sets: [
      { id: 'sr-1', setNumber: 1, playerAScore: 6, playerBScore: 4, tiebreakScoreA: null, tiebreakScoreB: null },
    ],
    ...overrides,
  };
}

const VALID_SETS = [{ setNumber: 1, playerAScore: 6, playerBScore: 4 }];

// Standard happy-path setup
function setupHappyPath(matchOverrides: Record<string, any> = {}) {
  mockPrisma.$transaction.mockImplementation(async (fn: any) => fn(mockTx));
  mockTx.match.findUnique.mockResolvedValue(makeMatch(matchOverrides));
  mockTx.match.update.mockResolvedValue({});
  mockTx.matchParticipant.updateMany.mockResolvedValue({});
  mockTx.result.findUnique
    .mockResolvedValueOnce(null)              // idempotency check → not found
    .mockResolvedValueOnce(makeResultWithSets()); // final fetch after creation
  mockTx.result.create.mockResolvedValue({ id: RESULT_ID });
  mockTx.setResult.create.mockResolvedValue({});
}

// ── Tests ─────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  Object.values(mockTx).forEach((group) =>
    Object.values(group as Record<string, any>).forEach((fn: any) => fn.mockReset?.())
  );
});

// ── Match validation ──────────────────────────────────────────────────────────

describe('submitMatchResult — validation', () => {
  it('throws 404 when match not found', async () => {
    mockPrisma.$transaction.mockImplementation(async (fn: any) => fn(mockTx));
    mockTx.match.findUnique.mockResolvedValue(null);

    await expect(
      ResultsService.submitMatchResult({ matchId: MATCH_ID, sets: VALID_SETS, currentUserId: USER_A })
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  it('throws 409 when match is not scheduled', async () => {
    mockPrisma.$transaction.mockImplementation(async (fn: any) => fn(mockTx));
    mockTx.match.findUnique.mockResolvedValue(makeMatch({ status: 'completed' }));

    await expect(
      ResultsService.submitMatchResult({ matchId: MATCH_ID, sets: VALID_SETS, currentUserId: USER_A })
    ).rejects.toMatchObject({ statusCode: 409 });
  });

  it('throws 403 when user is not a participant', async () => {
    mockPrisma.$transaction.mockImplementation(async (fn: any) => fn(mockTx));
    mockTx.match.findUnique.mockResolvedValue(makeMatch());

    await expect(
      ResultsService.submitMatchResult({ matchId: MATCH_ID, sets: VALID_SETS, currentUserId: 'outsider' })
    ).rejects.toMatchObject({ statusCode: 403 });
  });

  it('throws 400 when no sets provided for competitive match', async () => {
    setupHappyPath();
    // Override result.findUnique first call to return null (no existing result)
    mockTx.result.findUnique.mockReset();
    mockTx.result.findUnique.mockResolvedValueOnce(null);

    await expect(
      ResultsService.submitMatchResult({ matchId: MATCH_ID, sets: [], currentUserId: USER_A })
    ).rejects.toMatchObject({ statusCode: 400 });
  });
});

// ── Match type override ───────────────────────────────────────────────────────

describe('submitMatchResult — matchType override', () => {
  it('updates match.type when requestedMatchType differs', async () => {
    setupHappyPath({ type: 'competitive' });

    await ResultsService.submitMatchResult({
      matchId: MATCH_ID,
      sets: VALID_SETS,
      currentUserId: USER_A,
      matchType: 'practice',
    });

    expect(mockTx.match.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ type: 'practice' }) })
    );
  });

  it('does not update match.type when same as current', async () => {
    setupHappyPath({ type: 'competitive' });

    await ResultsService.submitMatchResult({
      matchId: MATCH_ID,
      sets: VALID_SETS,
      currentUserId: USER_A,
      matchType: 'competitive',
    });

    // Only status update should happen, no type update
    const typeCalls = mockTx.match.update.mock.calls.filter(
      (c: any) => 'type' in (c[0].data ?? {})
    );
    expect(typeCalls).toHaveLength(0);
  });

  it('returns null for practice match with no sets', async () => {
    setupHappyPath({ type: 'practice' });
    // Undo the second result.findUnique mock since we won't reach it
    mockTx.result.findUnique.mockReset();

    const result = await ResultsService.submitMatchResult({
      matchId: MATCH_ID,
      sets: [],
      currentUserId: USER_A,
    });

    expect(result).toBeNull();
  });

  it('does not set match status to awaiting_confirmation when type is practice', async () => {
    setupHappyPath({ type: 'practice' });

    await ResultsService.submitMatchResult({
      matchId: MATCH_ID,
      sets: VALID_SETS,
      currentUserId: USER_A,
    });

    const statusCalls = mockTx.match.update.mock.calls.filter(
      (c: any) => c[0].data?.status === 'awaiting_confirmation'
    );
    expect(statusCalls).toHaveLength(0);
  });

  it('sets match status to awaiting_confirmation for competitive', async () => {
    setupHappyPath({ type: 'competitive' });

    await ResultsService.submitMatchResult({
      matchId: MATCH_ID,
      sets: VALID_SETS,
      currentUserId: USER_A,
    });

    expect(mockTx.match.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: 'awaiting_confirmation' } })
    );
  });
});

// ── Idempotency ───────────────────────────────────────────────────────────────

describe('submitMatchResult — idempotency', () => {
  it('returns existing result without creating a duplicate', async () => {
    mockPrisma.$transaction.mockImplementation(async (fn: any) => fn(mockTx));
    mockTx.match.findUnique.mockResolvedValue(makeMatch());
    mockTx.match.update.mockResolvedValue({});
    mockTx.matchParticipant.updateMany.mockResolvedValue({});
    // Idempotency check returns existing result
    mockTx.result.findUnique.mockResolvedValueOnce(makeResultWithSets());

    await ResultsService.submitMatchResult({
      matchId: MATCH_ID,
      sets: VALID_SETS,
      currentUserId: USER_A,
    });

    expect(mockTx.result.create).not.toHaveBeenCalled();
    expect(mockTx.setResult.create).not.toHaveBeenCalled();
  });
});

// ── Team assignment ───────────────────────────────────────────────────────────

describe('submitMatchResult — team assignment', () => {
  it('uses explicit teamAssignment when provided', async () => {
    const matchNoTeams = makeMatch({
      participants: [
        { userId: USER_A, team: null },
        { userId: USER_B, team: null },
      ],
    });
    mockPrisma.$transaction.mockImplementation(async (fn: any) => fn(mockTx));
    mockTx.match.findUnique.mockResolvedValue(matchNoTeams);
    mockTx.match.update.mockResolvedValue({});
    mockTx.matchParticipant.updateMany.mockResolvedValue({});
    mockTx.result.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(makeResultWithSets());
    mockTx.result.create.mockResolvedValue({ id: RESULT_ID });
    mockTx.setResult.create.mockResolvedValue({});

    await ResultsService.submitMatchResult({
      matchId: MATCH_ID,
      sets: VALID_SETS,
      currentUserId: USER_A,
      teamAssignment: { teamAUserIds: [USER_A], teamBUserIds: [USER_B] },
    });

    expect(mockTx.matchParticipant.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ userId: USER_A }), data: { team: 'A' } })
    );
    expect(mockTx.matchParticipant.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ userId: USER_B }), data: { team: 'B' } })
    );
  });

  it('falls back to playerA/playerB when participants have no team set (singles)', async () => {
    const singlesNoTeams = makeMatch({
      participants: [
        { userId: USER_A, team: null },
        { userId: USER_B, team: null },
      ],
      playerA: { userId: USER_A },
      playerB: { userId: USER_B },
    });
    mockPrisma.$transaction.mockImplementation(async (fn: any) => fn(mockTx));
    mockTx.match.findUnique.mockResolvedValue(singlesNoTeams);
    mockTx.match.update.mockResolvedValue({});
    mockTx.matchParticipant.updateMany.mockResolvedValue({});
    mockTx.result.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(makeResultWithSets());
    mockTx.result.create.mockResolvedValue({ id: RESULT_ID });
    mockTx.setResult.create.mockResolvedValue({});

    await ResultsService.submitMatchResult({
      matchId: MATCH_ID,
      sets: VALID_SETS,
      currentUserId: USER_A,
    });

    expect(mockTx.matchParticipant.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ userId: USER_A }), data: { team: 'A' } })
    );
    expect(mockTx.matchParticipant.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ userId: USER_B }), data: { team: 'B' } })
    );
  });

  it('throws 400 when no team info and no playerA/playerB', async () => {
    const noTeamInfo = makeMatch({
      participants: [
        { userId: USER_A, team: null },
        { userId: USER_B, team: null },
      ],
      playerA: null,
      playerB: null,
    });
    mockPrisma.$transaction.mockImplementation(async (fn: any) => fn(mockTx));
    mockTx.match.findUnique.mockResolvedValue(noTeamInfo);

    await expect(
      ResultsService.submitMatchResult({ matchId: MATCH_ID, sets: VALID_SETS, currentUserId: USER_A })
    ).rejects.toMatchObject({ statusCode: 400 });
  });
});

// ── Confirmation timestamps ───────────────────────────────────────────────────

describe('submitMatchResult — confirmation timestamps', () => {
  it('sets confirmedByHostAt when submitter is in team A', async () => {
    setupHappyPath();

    await ResultsService.submitMatchResult({
      matchId: MATCH_ID,
      sets: VALID_SETS,
      currentUserId: USER_A, // USER_A is team A
    });

    expect(mockTx.result.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          confirmedByHostAt: expect.any(Date),
          confirmedByOpponentAt: null,
        }),
      })
    );
  });

  it('sets confirmedByOpponentAt when submitter is in team B', async () => {
    setupHappyPath();
    // Override result fetch so winner is USER_B
    mockTx.result.findUnique
      .mockReset()
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(makeResultWithSets({ winnerUserId: USER_B }));

    await ResultsService.submitMatchResult({
      matchId: MATCH_ID,
      sets: [{ setNumber: 1, playerAScore: 4, playerBScore: 6 }],
      currentUserId: USER_B, // USER_B is team B
    });

    expect(mockTx.result.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          confirmedByHostAt: null,
          confirmedByOpponentAt: expect.any(Date),
        }),
      })
    );
  });
});
