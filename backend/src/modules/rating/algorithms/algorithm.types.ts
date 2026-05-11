// Algorithm abstraction types for rating system

import { PlayerSnapshot, RatingUpdateResult } from './domain.types';

// Pluggable rating algorithm interface
export interface RatingAlgorithm {
  compute(input: { winner: PlayerSnapshot; loser: PlayerSnapshot; scoreRatio?: number }): RatingUpdateResult;
  // Algorithm is responsible for all rating/confidence math.
  // scoreRatio: winner games / total games — [0.5, 1.0] — omit to skip margin-of-victory scaling.
}
