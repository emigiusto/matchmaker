// Algorithm abstraction types for rating system

import { PlayerSnapshot, RatingUpdateResult } from './domain.types';

// Pluggable rating algorithm interface
export interface RatingAlgorithm {
  compute(input: { winner: PlayerSnapshot; loser: PlayerSnapshot }): RatingUpdateResult;
  // Algorithm is responsible for all rating/confidence math.
}
