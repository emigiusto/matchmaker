import { RatingAlgorithm } from './algorithm.types';
import { PlayerSnapshot, RatingConfig, RatingUpdateResult } from './domain.types';

/**
 * Pure deterministic rating algorithm.
 * Owns all rating/confidence update logic.
 */

export class DeterministicRatingAlgorithm implements RatingAlgorithm {

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
    }

    // Clamp delta to at least minExpectedGain after all calculations
    delta = Math.max(delta, c.minExpectedGain);
    // Round to 8 decimals to avoid floating-point issues
    delta = Math.round(delta * 1e8) / 1e8;

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
