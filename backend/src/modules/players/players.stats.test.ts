import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PlayersService } from './players.service';
import { AppError } from '../../shared/errors/AppError';

// ── Prisma mock ──────────────────────────────────────────────────────────────

vi.mock('../../prisma', () => {
  const mockPrisma: any = {
    player: { findUnique: vi.fn() },
    result: { findMany: vi.fn(), count: vi.fn() },
    ratingHistory: { findMany: vi.fn() },
  };
  return { prisma: mockPrisma };
});

vi.mock('../../shared/cache/redis', () => ({
  cacheGet: vi.fn().mockResolvedValue(null),
  cacheSet: vi.fn().mockResolvedValue(undefined),
  cacheDel: vi.fn().mockResolvedValue(undefined),
}));

import { prisma } from '../../prisma';
const mock = prisma as any;

// ── Helpers ──────────────────────────────────────────────────────────────────

const PLAYER_ID = 'player-1';
const USER_ID = 'user-1';
const OPP_USER_ID = 'user-2';

function makePlayer(overrides: Record<string, unknown> = {}) {
  return {
    id: PLAYER_ID,
    userId: USER_ID,
    levelValue: 3.5,
    levelConfidence: 0.8,
    lastMatchAt: null,
    ...overrides,
  };
}

/** Build a confirmed result where `winnerUserId` won against an opponent at `opponentLevel`. */
function makeResult(winnerUserId: string, opponentUserId: string, opponentLevel: number | null = 3.0) {
  return {
    winnerUserId,
    match: {
      participants: [
        { userId: USER_ID, user: { player: { levelValue: 3.5 } } },
        { userId: opponentUserId, user: { player: { levelValue: opponentLevel } } },
      ],
    },
  };
}

function makeRatingRow(newRating: number, delta: number, createdAt: Date = new Date()) {
  return { newRating, delta, createdAt };
}

beforeEach(() => {
  vi.clearAllMocks();
  mock.result.count.mockResolvedValue(0);
  mock.ratingHistory.findMany.mockResolvedValue([]);
});

// ── Tests ────────────────────────────────────────────────────────────────────

describe('PlayersService.getPlayerStats', () => {
  describe('player not found', () => {
    it('throws 404 AppError when player does not exist', async () => {
      mock.player.findUnique.mockResolvedValue(null);

      await expect(PlayersService.getPlayerStats(PLAYER_ID)).rejects.toThrow(AppError);
      await expect(PlayersService.getPlayerStats(PLAYER_ID)).rejects.toMatchObject({ statusCode: 404 });
    });
  });

  describe('no matches', () => {
    beforeEach(() => {
      mock.player.findUnique.mockResolvedValue(makePlayer());
      mock.result.findMany.mockResolvedValue([]);
      mock.result.count.mockResolvedValue(0);
    });

    it('returns zero counts', async () => {
      const stats = await PlayersService.getPlayerStats(PLAYER_ID);
      expect(stats.totalMatches).toBe(0);
      expect(stats.competitiveMatches).toBe(0);
      expect(stats.practiceMatches).toBe(0);
      expect(stats.wins).toBe(0);
      expect(stats.losses).toBe(0);
    });

    it('returns winRate 0', async () => {
      const stats = await PlayersService.getPlayerStats(PLAYER_ID);
      expect(stats.winRate).toBe(0);
    });

    it('returns streakType none and streak 0', async () => {
      const stats = await PlayersService.getPlayerStats(PLAYER_ID);
      expect(stats.streakType).toBe('none');
      expect(stats.currentStreak).toBe(0);
    });

    it('returns null averageOpponentLevel', async () => {
      const stats = await PlayersService.getPlayerStats(PLAYER_ID);
      expect(stats.averageOpponentLevel).toBeNull();
    });

    it('returns empty ratingHistory', async () => {
      const stats = await PlayersService.getPlayerStats(PLAYER_ID);
      expect(stats.ratingHistory).toEqual([]);
    });
  });

  describe('wins and losses', () => {
    it('counts wins correctly', async () => {
      mock.player.findUnique.mockResolvedValue(makePlayer());
      mock.result.findMany.mockResolvedValue([
        makeResult(USER_ID, OPP_USER_ID),
        makeResult(USER_ID, OPP_USER_ID),
        makeResult(OPP_USER_ID, OPP_USER_ID), // loss
      ]);

      const stats = await PlayersService.getPlayerStats(PLAYER_ID);
      expect(stats.wins).toBe(2);
      expect(stats.losses).toBe(1);
      expect(stats.competitiveMatches).toBe(3);
    });

    it('computes winRate as wins / competitiveMatches', async () => {
      mock.player.findUnique.mockResolvedValue(makePlayer());
      mock.result.findMany.mockResolvedValue([
        makeResult(USER_ID, OPP_USER_ID),
        makeResult(OPP_USER_ID, OPP_USER_ID),
      ]);

      const stats = await PlayersService.getPlayerStats(PLAYER_ID);
      expect(stats.winRate).toBeCloseTo(0.5);
    });

    it('winRate is 1 when all competitive matches are wins', async () => {
      mock.player.findUnique.mockResolvedValue(makePlayer());
      mock.result.findMany.mockResolvedValue([
        makeResult(USER_ID, OPP_USER_ID),
        makeResult(USER_ID, OPP_USER_ID),
      ]);

      const stats = await PlayersService.getPlayerStats(PLAYER_ID);
      expect(stats.winRate).toBe(1);
    });
  });

  describe('streak calculation', () => {
    it('detects a win streak', async () => {
      mock.player.findUnique.mockResolvedValue(makePlayer());
      // results are ordered desc (most recent first)
      mock.result.findMany.mockResolvedValue([
        makeResult(USER_ID, OPP_USER_ID),
        makeResult(USER_ID, OPP_USER_ID),
        makeResult(USER_ID, OPP_USER_ID),
        makeResult(OPP_USER_ID, OPP_USER_ID), // streak stops here
      ]);

      const stats = await PlayersService.getPlayerStats(PLAYER_ID);
      expect(stats.streakType).toBe('win');
      expect(stats.currentStreak).toBe(3);
    });

    it('detects a loss streak', async () => {
      mock.player.findUnique.mockResolvedValue(makePlayer());
      mock.result.findMany.mockResolvedValue([
        makeResult(OPP_USER_ID, OPP_USER_ID),
        makeResult(OPP_USER_ID, OPP_USER_ID),
        makeResult(USER_ID, OPP_USER_ID), // streak stops
      ]);

      const stats = await PlayersService.getPlayerStats(PLAYER_ID);
      expect(stats.streakType).toBe('loss');
      expect(stats.currentStreak).toBe(2);
    });

    it('streak is 1 when most recent result differs from next', async () => {
      mock.player.findUnique.mockResolvedValue(makePlayer());
      mock.result.findMany.mockResolvedValue([
        makeResult(USER_ID, OPP_USER_ID),   // win
        makeResult(OPP_USER_ID, OPP_USER_ID), // loss
      ]);

      const stats = await PlayersService.getPlayerStats(PLAYER_ID);
      expect(stats.streakType).toBe('win');
      expect(stats.currentStreak).toBe(1);
    });

    it('full win streak across all matches', async () => {
      mock.player.findUnique.mockResolvedValue(makePlayer());
      mock.result.findMany.mockResolvedValue([
        makeResult(USER_ID, OPP_USER_ID),
        makeResult(USER_ID, OPP_USER_ID),
      ]);

      const stats = await PlayersService.getPlayerStats(PLAYER_ID);
      expect(stats.currentStreak).toBe(2);
    });
  });

  describe('practice matches', () => {
    it('includes practice count in totalMatches', async () => {
      mock.player.findUnique.mockResolvedValue(makePlayer());
      mock.result.findMany.mockResolvedValue([makeResult(USER_ID, OPP_USER_ID)]);
      mock.result.count.mockResolvedValue(3);

      const stats = await PlayersService.getPlayerStats(PLAYER_ID);
      expect(stats.practiceMatches).toBe(3);
      expect(stats.competitiveMatches).toBe(1);
      expect(stats.totalMatches).toBe(4);
    });

    it('practice matches do not affect wins, losses or winRate', async () => {
      mock.player.findUnique.mockResolvedValue(makePlayer());
      mock.result.findMany.mockResolvedValue([]);
      mock.result.count.mockResolvedValue(5);

      const stats = await PlayersService.getPlayerStats(PLAYER_ID);
      expect(stats.wins).toBe(0);
      expect(stats.losses).toBe(0);
      expect(stats.winRate).toBe(0);
    });
  });

  describe('averageOpponentLevel', () => {
    it('averages opponent levelValues', async () => {
      mock.player.findUnique.mockResolvedValue(makePlayer());
      mock.result.findMany.mockResolvedValue([
        makeResult(USER_ID, 'opp-a', 3.0),
        makeResult(USER_ID, 'opp-b', 4.0),
      ]);

      const stats = await PlayersService.getPlayerStats(PLAYER_ID);
      expect(stats.averageOpponentLevel).toBeCloseTo(3.5);
    });

    it('skips participants without a levelValue', async () => {
      mock.player.findUnique.mockResolvedValue(makePlayer());
      mock.result.findMany.mockResolvedValue([
        makeResult(USER_ID, OPP_USER_ID, null),  // null level — skipped
        makeResult(USER_ID, OPP_USER_ID, 4.0),
      ]);

      const stats = await PlayersService.getPlayerStats(PLAYER_ID);
      expect(stats.averageOpponentLevel).toBeCloseTo(4.0);
    });

    it('returns null when no opponent has a levelValue', async () => {
      mock.player.findUnique.mockResolvedValue(makePlayer());
      mock.result.findMany.mockResolvedValue([
        makeResult(USER_ID, OPP_USER_ID, null),
      ]);

      const stats = await PlayersService.getPlayerStats(PLAYER_ID);
      expect(stats.averageOpponentLevel).toBeNull();
    });

    it('excludes self from opponent level calculation', async () => {
      // Both participant entries for self should not contribute
      mock.player.findUnique.mockResolvedValue(makePlayer());
      mock.result.findMany.mockResolvedValue([
        {
          winnerUserId: USER_ID,
          match: {
            participants: [
              { userId: USER_ID, user: { player: { levelValue: 99 } } }, // self — must be excluded
              { userId: OPP_USER_ID, user: { player: { levelValue: 2.0 } } },
            ],
          },
        },
      ]);

      const stats = await PlayersService.getPlayerStats(PLAYER_ID);
      expect(stats.averageOpponentLevel).toBeCloseTo(2.0);
    });
  });

  describe('ratingHistory', () => {
    it('maps RatingHistory rows to { date, rating, delta }', async () => {
      const now = new Date('2025-01-15T10:00:00.000Z');
      mock.player.findUnique.mockResolvedValue(makePlayer());
      mock.result.findMany.mockResolvedValue([]);
      mock.ratingHistory.findMany.mockResolvedValue([
        makeRatingRow(3.1, 0.1, now),
      ]);

      const stats = await PlayersService.getPlayerStats(PLAYER_ID);
      expect(stats.ratingHistory).toHaveLength(1);
      expect(stats.ratingHistory[0]).toEqual({
        date: now.toISOString(),
        rating: 3.1,
        delta: 0.1,
      });
    });

    it('returns rows in ascending createdAt order (oldest first for chart)', async () => {
      const d1 = new Date('2025-01-01');
      const d2 = new Date('2025-02-01');
      const d3 = new Date('2025-03-01');
      mock.player.findUnique.mockResolvedValue(makePlayer());
      mock.result.findMany.mockResolvedValue([]);
      // The service passes orderBy: { createdAt: 'asc' } to Prisma;
      // the mock returns whatever we give it — we verify the mapping preserves order.
      mock.ratingHistory.findMany.mockResolvedValue([
        makeRatingRow(3.0, 0.0, d1),
        makeRatingRow(3.1, 0.1, d2),
        makeRatingRow(3.05, -0.05, d3),
      ]);

      const stats = await PlayersService.getPlayerStats(PLAYER_ID);
      expect(stats.ratingHistory.map((r) => r.date)).toEqual([
        d1.toISOString(),
        d2.toISOString(),
        d3.toISOString(),
      ]);
    });

    it('queries ratingHistory for the correct playerId', async () => {
      mock.player.findUnique.mockResolvedValue(makePlayer());
      mock.result.findMany.mockResolvedValue([]);

      await PlayersService.getPlayerStats(PLAYER_ID);

      expect(mock.ratingHistory.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { playerId: PLAYER_ID } }),
      );
    });

    it('returns empty ratingHistory when no rows exist', async () => {
      mock.player.findUnique.mockResolvedValue(makePlayer());
      mock.result.findMany.mockResolvedValue([]);
      mock.ratingHistory.findMany.mockResolvedValue([]);

      const stats = await PlayersService.getPlayerStats(PLAYER_ID);
      expect(stats.ratingHistory).toEqual([]);
    });
  });
});
