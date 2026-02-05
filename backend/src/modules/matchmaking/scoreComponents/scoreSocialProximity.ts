/**
 * Social proximity scoring for matchmaking.
 * Goal: Prioritize friends, then previous opponents, then community.
 * Future: Add friendship status, group membership, or social graph analysis.
 */
import * as MatchmakingConstants from '../matchmaking.constants';
import { ScoreResult } from '../matchmaking.service';

/**
 * Returns a score and reason for social proximity.
 * Future: Add pending/accepted friendship, group logic, etc.
 */
export function scoreSocialProximity({ isFriend, isPreviousOpponent }: SocialProximityInput): ScoreResult {
  if (isFriend) return { score: 50 * MatchmakingConstants.WEIGHT_SOCIAL_PROXIMITY, reason: 'You are friends' };
  if (isPreviousOpponent) return { score: 20 * MatchmakingConstants.WEIGHT_SOCIAL_PROXIMITY, reason: 'You have played before' };
  return { score: 0, reason: 'No social connection' };
}

export interface SocialProximityInput {
  isFriend: boolean;
  isPreviousOpponent: boolean;
}