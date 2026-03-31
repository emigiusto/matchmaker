/**
 * Level closeness scoring for matchmaking.
 * Goal: Match players of similar skill for fair games.
 * Future: Use dynamic rating systems, recent performance, or confidence intervals.
 */
import * as MatchmakingConstants from '../matchmaking.constants';
import { ScoreResult } from '../matchmaking.service';

/**
 * Returns a score and reason for level compatibility.
 * Future: Use ELO, Glicko, or other rating systems.
 */
export function scoreLevelCompatibility({requesterLevel, candidateLevel, confidence}: LevelCompatibilityInput): ScoreResult {
  if (requesterLevel == null || candidateLevel == null || confidence < 0.3) {
    return {
      score: 10 * MatchmakingConstants.WEIGHT_LEVEL_COMPATIBILITY,
      reason: 'Level unknown or uncertain; being inclusive'
    };
  }
  const diff = Math.abs(requesterLevel - candidateLevel);
  if (diff <= 50) {
    return {
      score: 20 * MatchmakingConstants.WEIGHT_LEVEL_COMPATIBILITY,
      reason: `Very close in level (Δ${Math.round(diff)})`
    };
  }
  if (diff <= 150) {
    return {
      score: 5 * MatchmakingConstants.WEIGHT_LEVEL_COMPATIBILITY,
      reason: `Playable level difference (Δ${Math.round(diff)})`
    };
  }
  return {
    score: -5 * MatchmakingConstants.WEIGHT_LEVEL_COMPATIBILITY,
    reason: `Level difference is significant (Δ${Math.round(diff)})`
  };
}

export interface LevelCompatibilityInput {
  requesterLevel?: number | null;
  candidateLevel?: number | null;
  confidence: number;
}