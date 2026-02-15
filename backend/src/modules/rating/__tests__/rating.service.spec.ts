import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RatingService, defaultConfig } from '../rating.service';
import { DeterministicRatingAlgorithm } from '../algorithms/deterministic.algorithm';
import { AppError } from '../../../shared/errors/AppError';

// Helper: create a mock Prisma TransactionClient
function makeMockTx(overrides: Partial<any> = {}) {
  return {
    match: { findUnique: vi.fn() },
    result: { findUnique: vi.fn() },
    player: { findUnique: vi.fn(), update: vi.fn() },
    ratingHistory: { create: vi.fn() },
    ...overrides,
  };
}

describe('RatingService.updateRatingsForCompletedMatch', () => {
  const matchId = 'match-1';
  const playerA = { id: 'a', userId: 'ua', levelValue: 3, levelConfidence: 0.3 };
  const playerB = { id: 'b', userId: 'ub', levelValue: 4, levelConfidence: 0.4 };
  const completedMatch = { id: matchId, status: 'completed', playerAId: 'a', playerBId: 'b' };
  const result = { matchId, winnerUserId: 'ua' };

  beforeEach(() => {
    // Always use deterministic algorithm for test
    RatingService.setAlgorithm(new DeterministicRatingAlgorithm(defaultConfig));
  });

  it('skips if match not found', async () => {
    const tx = makeMockTx();
    tx.match.findUnique.mockResolvedValue(null);
    await expect(RatingService.updateRatingsForCompletedMatch(tx, matchId)).resolves.toBeUndefined();
  });

  it("skips if match status not 'completed'", async () => {
    const tx = makeMockTx();
    tx.match.findUnique.mockResolvedValue({ ...completedMatch, status: 'pending' });
    await expect(RatingService.updateRatingsForCompletedMatch(tx, matchId)).resolves.toBeUndefined();
  });

  it('throws if winnerUserId missing', async () => {
    const tx = makeMockTx();
    tx.match.findUnique.mockResolvedValue(completedMatch);
    tx.result.findUnique.mockResolvedValue({ matchId, winnerUserId: null });
    await expect(RatingService.updateRatingsForCompletedMatch(tx, matchId)).rejects.toThrow(AppError);
  });

  it('skips if players missing', async () => {
    const tx = makeMockTx();
    tx.match.findUnique.mockResolvedValue(completedMatch);
    tx.result.findUnique.mockResolvedValue(result);
    tx.player.findUnique.mockResolvedValueOnce(null);
    await expect(RatingService.updateRatingsForCompletedMatch(tx, matchId)).resolves.toBeUndefined();
  });

  it('uses default rating/confidence if levelValue is null', async () => {
    const tx = makeMockTx();
    tx.match.findUnique.mockResolvedValue(completedMatch);
    tx.result.findUnique.mockResolvedValue(result);
    tx.player.findUnique
      .mockResolvedValueOnce({ ...playerA, levelValue: null, levelConfidence: null })
      .mockResolvedValueOnce(playerB);
    tx.player.update.mockResolvedValue({});
    tx.ratingHistory.create.mockResolvedValue({});
    await RatingService.updateRatingsForCompletedMatch(tx, matchId);
    expect(tx.player.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: playerA.id },
        data: expect.objectContaining({ levelValue: expect.any(Number), levelConfidence: expect.any(Number) })
      })
    );
  });

  it('persists updated ratings for both players', async () => {
    const tx = makeMockTx();
    tx.match.findUnique.mockResolvedValue(completedMatch);
    tx.result.findUnique.mockResolvedValue(result);
    tx.player.findUnique.mockResolvedValueOnce(playerA).mockResolvedValueOnce(playerB);
    tx.player.update.mockResolvedValue({});
    tx.ratingHistory.create.mockResolvedValue({});
    await RatingService.updateRatingsForCompletedMatch(tx, matchId);
    expect(tx.player.update).toHaveBeenCalledTimes(2);
    expect(tx.player.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: playerA.id } })
    );
    expect(tx.player.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: playerB.id } })
    );
  });

  it('creates rating history when enabled', async () => {
    const tx = makeMockTx();
    tx.match.findUnique.mockResolvedValue(completedMatch);
    tx.result.findUnique.mockResolvedValue(result);
    tx.player.findUnique.mockResolvedValueOnce(playerA).mockResolvedValueOnce(playerB);
    tx.player.update.mockResolvedValue({});
    tx.ratingHistory.create.mockResolvedValue({});
    await RatingService.updateRatingsForCompletedMatch(tx, matchId);
    expect(tx.ratingHistory.create).toHaveBeenCalledTimes(2);
    expect(tx.ratingHistory.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ playerId: playerA.id }) })
    );
    expect(tx.ratingHistory.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ playerId: playerB.id }) })
    );
  });
});
