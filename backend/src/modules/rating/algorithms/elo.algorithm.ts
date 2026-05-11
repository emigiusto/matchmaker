import { RatingAlgorithm } from './algorithm.types';
import { EloPlayerSnapshot, RatingUpdateResult } from './domain.types';
import { computeDecayedConfidence } from '../utils/confidence.utils';

/**
 * Pure ELO rating algorithm (future-ready, not yet active).
 * No side effects, no dependencies.
 */

export class EloRatingAlgorithm implements RatingAlgorithm {
  constructor(
    private readonly kFactor: number = 32,
    private readonly confidenceIncrement: number = 0.05,
    private readonly confidenceMax: number = 1,
    private readonly confidenceDecayRate: number = 0.01,
    private readonly inactivityThresholdDays: number = 14,
    private readonly minConfidence: number = 0
  ) {}

  compute(input: { winner: EloPlayerSnapshot; loser: EloPlayerSnapshot; scoreRatio?: number }): RatingUpdateResult {
    // Apply confidence decay to both players BEFORE volatility calculation
    const now = new Date();
    const winnerConfidenceDecayed = computeDecayedConfidence(
      input.winner.confidence,
      input.winner.lastMatchAt,
      now,
      this.confidenceDecayRate,
      this.inactivityThresholdDays,
      this.minConfidence
    );
    const loserConfidenceDecayed = computeDecayedConfidence(
      input.loser.confidence,
      input.loser.lastMatchAt,
      now,
      this.confidenceDecayRate,
      this.inactivityThresholdDays,
      this.minConfidence
    );

    // 1. Compute volatility multipliers for both players (lower confidence = higher volatility)
    const winnerVolatility = 1 + (1 - winnerConfidenceDecayed); // 0.0 → 2.0, 1.0 → 1.0
    const loserVolatility = 1 + (1 - loserConfidenceDecayed);

    // 2. Compute effective K for both players
    const winnerK = this.kFactor * winnerVolatility;
    const loserK = this.kFactor * loserVolatility;

    // 3. Compute expected score (classic ELO)
    const expectedScore = 1 / (1 + Math.pow(10, (input.loser.rating - input.winner.rating) / 400));

    // 4. Margin-of-victory multiplier: [0.5, 1.0] ratio → [1.0, 2.0]x scaling
    // Omitting scoreRatio (no set data) keeps multiplier at 1.0 (standard behavior).
    const movMultiplier = input.scoreRatio !== undefined
      ? 1 + (Math.max(0.5, Math.min(1.0, input.scoreRatio)) - 0.5) * 2
      : 1;

    // 5. Compute deltas independently (not strictly zero-sum)
    const winnerDelta = winnerK * (1 - expectedScore) * movMultiplier;
    const loserDelta = loserK * (0 - (1 - expectedScore)) * movMultiplier;

    const winnerNewRating = input.winner.rating + winnerDelta;
    const loserNewRating = input.loser.rating + loserDelta;

    // 6. Confidence update (simple increment, clamped)
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
