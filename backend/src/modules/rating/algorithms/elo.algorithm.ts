import { RatingAlgorithm } from './algorithm.types';
import { PlayerSnapshot, RatingUpdateResult } from './domain.types';

/**
 * Pure ELO rating algorithm (future-ready, not yet active).
 * No side effects, no dependencies.
 */
export class EloRatingAlgorithm implements RatingAlgorithm {
  constructor(
    private readonly kFactor: number = 32,
    private readonly confidenceIncrement: number = 0.02,
    private readonly confidenceMax: number = 1
  ) {}

  compute(input: { winner: PlayerSnapshot; loser: PlayerSnapshot }): RatingUpdateResult {
    const { winner, loser } = input;
    // 1. Compute volatility multiplier for each player (lower confidence = higher volatility)
    const winnerVolatility = 1 + (1 - winner.confidence); // 0.0 → 2.0, 1.0 → 1.0
    const loserVolatility = 1 + (1 - loser.confidence);

    // 2. Compute effective K for each player
    const winnerK = this.kFactor * winnerVolatility;
    const loserK = this.kFactor * loserVolatility;

    // 3. Compute expected score (standard ELO)
    const expectedScore = 1 / (1 + Math.pow(10, (loser.rating - winner.rating) / 400));

    // 4. Compute winner delta (asymmetric, but keep system zero-sum)
    const winnerDelta = winnerK * (1 - expectedScore);
    // For strict zero-sum, loser loses same amount as winner gains
    const winnerNewRating = winner.rating + winnerDelta;
    const loserNewRating = loser.rating - winnerDelta;

    // 5. Confidence update (simple increment, clamped)
    const winnerNewConfidence = Math.min(winner.confidence + this.confidenceIncrement, this.confidenceMax);
    const loserNewConfidence = Math.min(loser.confidence + this.confidenceIncrement, this.confidenceMax);

    // Return full update result
    return {
      winnerNewRating,
      loserNewRating,
      winnerNewConfidence,
      loserNewConfidence
    };
  }
}
