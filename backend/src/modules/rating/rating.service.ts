import { PlayerSnapshot, EloPlayerSnapshot, RatingConfig } from './algorithms/domain.types';
import { RatingAlgorithm } from './algorithms/algorithm.types';
import { EloRatingAlgorithm } from './algorithms/elo.algorithm';
import { DeterministicRatingAlgorithm } from './algorithms/deterministic.algorithm';
import { Prisma } from '@prisma/client';
import { AppError } from '../../shared/errors/AppError';

// Default config for deterministic algorithm
export const defaultConfig: RatingConfig = {
  baseGain: 0.1,
  upsetMultiplier: 1.5,
  maxDelta: 0.25,
  lossFactor: 0.5,
  confidenceIncrement: 0.02,
  confidenceMax: 1,
  defaultRating: 3.0,
  defaultConfidence: 0.3,
  minExpectedGain: 0.03,
  enableHistoryTracking: true,
};

export type RatingTx = {
  match: {
    findUnique: (args: { where: { id: string } }) => Promise<{
      id: string;
      inviteId: string | null;
      availabilityId: string;
      venueId: string | null;
      playerAId: string | null;
      playerBId: string | null;
      scheduledAt: Date;
      createdAt: Date;
      status: string;
      hostUserId: string;
      opponentUserId: string;
    } | null>;
  };

  result: Pick<
    Prisma.TransactionClient['result'],
    'findUnique'
  >;

  player: {
    findUnique: (args: { where: { id: string } }) => Promise<{
      id: string;
      userId: string;
      levelValue: number | null;
      levelConfidence: number | null;
      lastMatchAt?: Date | null;
    } | null>;
    update: (args: {
      where: { id: string };
      data: {
        levelValue?: number;
        levelConfidence?: number;
        lastMatchAt?: Date;
      };
    }) => Promise<any>;
  };

  ratingHistory: Pick<
    Prisma.TransactionClient['ratingHistory'],
    'create'
  >;
};


export class RatingService {
  // Pluggable algorithm (default: Deterministic)
  private static algorithm: RatingAlgorithm = new DeterministicRatingAlgorithm(defaultConfig);

  // Allow runtime algorithm switching
  static setAlgorithm(algo: RatingAlgorithm) {
    this.algorithm = algo;
  }
  /**
   * Update ratings for a completed match.
   * Runs inside a provided Prisma transaction.
   * Silently skips if match/players missing or not completed.
   * Throws only if winner is missing.
   */
  static async updateRatingsForCompletedMatch(
    tx: RatingTx,
    matchId: string
  ): Promise<void> {
    // 1. Load Match
    const match = await tx.match.findUnique({ where: { id: matchId } });
    if (!match) return;
    // Strict guard: Only update ratings if match is completed
    if (match.status !== 'completed') {
      return;
    }

    // 4. Load Result
    const result = await tx.result.findUnique({ where: { matchId } });
    if (!result) return;
    // Defensive: Only update if result is confirmed
    if (result.status !== 'confirmed') {
      return;
    }
    if (!result.winnerUserId) throw new AppError('Cannot update ratings: winner missing', 500);

    // 7. Load Player A and Player B
    if (!match.playerAId || !match.playerBId) return;
    const [playerA, playerB] = await Promise.all([
      tx.player.findUnique({ where: { id: match.playerAId } }),
      tx.player.findUnique({ where: { id: match.playerBId } })
    ]);
    if (!playerA || !playerB) return;

    // Idempotency: check if ratingHistory already exists for both players for this match
    // @ts-ignore: ratingHistory.findMany may not be typed on RatingTx, but is available on Prisma client
    const histories = await (tx.ratingHistory.findMany?.({
      where: {
        matchId: match.id,
        playerId: { in: [playerA.id, playerB.id] },
      },
    }) ?? []);
    if (histories.length === 2) {
      // Both players already have rating history for this match; skip update
      return;
    }

    // 9. Determine winner/loser
    let winnerPlayer, loserPlayer;
    if (playerA.userId === result.winnerUserId) {
      winnerPlayer = playerA;
      loserPlayer = playerB;
    } else if (playerB.userId === result.winnerUserId) {
      winnerPlayer = playerB;
      loserPlayer = playerA;
    } else {
      throw new AppError('Cannot update ratings: winner does not match players', 500);
    }

    let updateResult;
    let winnerSnapshot: PlayerSnapshot | EloPlayerSnapshot;
    let loserSnapshot: PlayerSnapshot | EloPlayerSnapshot;
    // Use scheduledAt as the match date for ratings
    let matchDate: Date = match.scheduledAt ?? new Date();
    if (this.algorithm instanceof EloRatingAlgorithm) {
      // ELO requires lastMatchAt (non-null)
      winnerSnapshot = {
        rating: winnerPlayer.levelValue ?? defaultConfig.defaultRating,
        confidence: winnerPlayer.levelConfidence ?? defaultConfig.defaultConfidence,
        lastMatchAt: winnerPlayer.lastMatchAt ?? matchDate,
      };
      loserSnapshot = {
        rating: loserPlayer.levelValue ?? defaultConfig.defaultRating,
        confidence: loserPlayer.levelConfidence ?? defaultConfig.defaultConfidence,
        lastMatchAt: loserPlayer.lastMatchAt ?? matchDate,
      };
      updateResult = this.algorithm.compute({
        winner: winnerSnapshot as EloPlayerSnapshot,
        loser: loserSnapshot as EloPlayerSnapshot
      });
    } else {
      // Deterministic or other algorithms
      winnerSnapshot = {
        rating: winnerPlayer.levelValue ?? defaultConfig.defaultRating,
        confidence: winnerPlayer.levelConfidence ?? defaultConfig.defaultConfidence,
      };
      loserSnapshot = {
        rating: loserPlayer.levelValue ?? defaultConfig.defaultRating,
        confidence: loserPlayer.levelConfidence ?? defaultConfig.defaultConfidence,
      };
      updateResult = this.algorithm.compute({
        winner: winnerSnapshot,
        loser: loserSnapshot
      });
    }

    // 15. Persist updates

    if (this.algorithm instanceof EloRatingAlgorithm) {
      await Promise.all([
        tx.player.update({
          where: { id: winnerPlayer.id },
          data: {
            levelValue: updateResult.winnerNewRating,
            levelConfidence: updateResult.winnerNewConfidence,
            lastMatchAt: matchDate,
          },
        }),
        tx.player.update({
          where: { id: loserPlayer.id },
          data: {
            levelValue: updateResult.loserNewRating,
            levelConfidence: updateResult.loserNewConfidence,
            lastMatchAt: matchDate,
          },
        })
      ]);
    } else {
      await Promise.all([
        tx.player.update({
          where: { id: winnerPlayer.id },
          data: {
            levelValue: updateResult.winnerNewRating,
            levelConfidence: updateResult.winnerNewConfidence,
          },
        }),
        tx.player.update({
          where: { id: loserPlayer.id },
          data: {
            levelValue: updateResult.loserNewRating,
            levelConfidence: updateResult.loserNewConfidence,
          },
        })
      ]);
    }

    // 16. Optionally track rating history
    if (defaultConfig.enableHistoryTracking) {
      await Promise.all([
        tx.ratingHistory.create({
          data: {
            playerId: winnerPlayer.id,
            matchId: match.id,
            oldRating: winnerSnapshot.rating,
            newRating: updateResult.winnerNewRating,
            delta: updateResult.winnerNewRating - winnerSnapshot.rating,
            oldConfidence: winnerSnapshot.confidence,
            newConfidence: updateResult.winnerNewConfidence,
          },
        }),
        tx.ratingHistory.create({
          data: {
            playerId: loserPlayer.id,
            matchId: match.id,
            oldRating: loserSnapshot.rating,
            newRating: updateResult.loserNewRating,
            delta: updateResult.loserNewRating - loserSnapshot.rating,
            oldConfidence: loserSnapshot.confidence,
            newConfidence: updateResult.loserNewConfidence,
          },
        })
      ]);
    }
  }
}