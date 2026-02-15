import { RatingAlgorithm } from './algorithm.types';
import { EloPlayerSnapshot, RatingUpdateResult } from './domain.types';

/**
 * Pure ELO rating algorithm (future-ready, not yet active).
 * No side effects, no dependencies.
 */

export class EloRatingAlgorithm implements RatingAlgorithm {
  constructor(
    private readonly kFactor: number = 32,
    private readonly confidenceIncrement: number = 0.02,
    private readonly confidenceMax: number = 1,
    private readonly confidenceDecayRate: number = 0.01,
    private readonly inactivityThresholdDays: number = 14,
    private readonly minConfidence: number = 0
  ) {}

  compute(input: { winner: EloPlayerSnapshot; loser: EloPlayerSnapshot }): RatingUpdateResult {
    // Apply confidence decay to both players BEFORE volatility calculation
    const now = new Date();
    const decayConfidence = (confidence: number, lastMatchAt: Date): number => {
      const daysSince = Math.floor((now.getTime() - lastMatchAt.getTime()) / (1000 * 60 * 60 * 24));
      if (daysSince > this.inactivityThresholdDays) {
        const daysOver = daysSince - this.inactivityThresholdDays;
        return Math.max(this.minConfidence, confidence - daysOver * this.confidenceDecayRate);
      }
      return confidence;
    };

    const winnerConfidenceDecayed = decayConfidence(input.winner.confidence, input.winner.lastMatchAt);
    const loserConfidenceDecayed = decayConfidence(input.loser.confidence, input.loser.lastMatchAt);

    // 1. Compute volatility multipliers for both players (lower confidence = higher volatility)
    const winnerVolatility = 1 + (1 - winnerConfidenceDecayed); // 0.0 → 2.0, 1.0 → 1.0
    const loserVolatility = 1 + (1 - loserConfidenceDecayed);

    // 2. Compute effective K for both players
    const winnerK = this.kFactor * winnerVolatility;
    const loserK = this.kFactor * loserVolatility;

    // 3. Compute expected score (classic ELO)
    const expectedScore = 1 / (1 + Math.pow(10, (input.loser.rating - input.winner.rating) / 400));

    // 4. Compute deltas independently (not strictly zero-sum)
    const winnerDelta = winnerK * (1 - expectedScore);
    const loserDelta = loserK * (0 - (1 - expectedScore));

    const winnerNewRating = input.winner.rating + winnerDelta;
    const loserNewRating = input.loser.rating + loserDelta;

    // 5. Confidence update (simple increment, clamped)
    const winnerNewConfidence = Math.min(winnerConfidenceDecayed + this.confidenceIncrement, this.confidenceMax);
    const loserNewConfidence = Math.min(loserConfidenceDecayed + this.confidenceIncrement, this.confidenceMax);

    // Return full update result
    return {
      winnerNewRating,
      loserNewRating,
      winnerNewConfidence,
      loserNewConfidence
    };
  }
}
