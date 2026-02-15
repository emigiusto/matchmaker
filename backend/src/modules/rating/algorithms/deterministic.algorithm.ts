import { RatingAlgorithm } from './algorithm.types';
import { PlayerSnapshot, RatingConfig, RatingUpdateResult } from './domain.types';

/**
 * Pure deterministic rating algorithm.
 * Owns all rating/confidence update logic.
 */
export class DeterministicRatingAlgorithm implements RatingAlgorithm {
  // Algorithm constants
  private static readonly BASE_GAIN = 0.1;
  private static readonly UPSET_MULTIPLIER = 1.5;
  private static readonly MAX_DELTA = 0.25;
  private static readonly MIN_EXPECTED_GAIN = 0.03;

  constructor(private readonly config: RatingConfig) {}

  compute(input: { winner: PlayerSnapshot; loser: PlayerSnapshot }): RatingUpdateResult {
    const { winner, loser } = input;
    const c = this.config;
    const ratingDiff = Math.abs(winner.rating - loser.rating);
    const lowerRatedWins = winner.rating < loser.rating;
    let delta: number;
    if (lowerRatedWins) {
      delta = c.baseGain + (ratingDiff * 0.1);
      delta = delta * c.upsetMultiplier;
      delta = Math.min(delta, c.maxDelta);
    } else {
      delta = c.baseGain - (ratingDiff * 0.05);
      delta = Math.max(delta, c.minExpectedGain);
    }

    const winnerNewRating = winner.rating + delta;
    const loserNewRating = loser.rating - (delta * c.lossFactor);
    const winnerNewConfidence = Math.min(winner.confidence + c.confidenceIncrement, c.confidenceMax);
    const loserNewConfidence = Math.min(loser.confidence + c.confidenceIncrement, c.confidenceMax);

    return {
      winnerNewRating,
      loserNewRating,
      winnerNewConfidence,
      loserNewConfidence
    };
  }
}
