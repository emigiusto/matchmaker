import { PlayerSnapshot, RatingConfig } from './algorithms/domain.types';
import { RatingAlgorithm } from './algorithms/algorithm.types';
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
  match: Pick<
    Prisma.TransactionClient['match'],
    'findUnique'
  >;

  result: Pick<
    Prisma.TransactionClient['result'],
    'findUnique'
  >;

  player: Pick<
    Prisma.TransactionClient['player'],
    'findUnique' | 'update'
  >;

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
    if (match.status !== 'completed') return;

    // 4. Load Result
    const result = await tx.result.findUnique({ where: { matchId } });
    if (!result) return;
    if (!result.winnerUserId) throw new AppError('Cannot update ratings: winner missing', 500);

    // 7. Load Player A and Player B
    if (!match.playerAId || !match.playerBId) return;
    const [playerA, playerB] = await Promise.all([
      tx.player.findUnique({ where: { id: match.playerAId } }),
      tx.player.findUnique({ where: { id: match.playerBId } })
    ]);
    if (!playerA || !playerB) return;

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

    const winnerSnapshot: PlayerSnapshot = {
      rating: winnerPlayer.levelValue ?? defaultConfig.defaultRating,
      confidence: winnerPlayer.levelConfidence ?? defaultConfig.defaultConfidence,
    };
    const loserSnapshot: PlayerSnapshot = {
      rating: loserPlayer.levelValue ?? defaultConfig.defaultRating,
      confidence: loserPlayer.levelConfidence ?? defaultConfig.defaultConfidence,
    };

    // Delegate full update to algorithm
    const updateResult = this.algorithm.compute({
      winner: winnerSnapshot,
      loser: loserSnapshot
    });

    // 15. Persist updates

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


// Optionally export for testing
// export { DeterministicRatingAlgorithm };