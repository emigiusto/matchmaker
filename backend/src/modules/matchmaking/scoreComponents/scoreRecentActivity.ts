// scoreRecentActivity.ts
// Rewards candidates who have played recently, using Player.lastMatchAt.
// A recently active player is more likely to be engaged and responsive to invites.
import * as MatchmakingConstants from '../matchmaking.constants';
import { ScoreResult } from '../matchmaking.service';

/**
 * Returns a score and reason based on how recently the candidate played a match.
 *
 * Scoring:
 *   - lastMatchAt within 30 days: SCORE_RECENT_30_DAYS
 *   - lastMatchAt within 31–90 days: SCORE_RECENT_90_DAYS
 *   - older than 90 days or null: 0, no reason emitted
 */
export function scoreRecentActivity({ lastMatchAt }: RecentActivityInput): ScoreResult {
  if (!lastMatchAt) {
    return { score: 0, reason: '' };
  }

  const now = Date.now();
  const ageMs = now - new Date(lastMatchAt).getTime();
  const ageDays = ageMs / (1000 * 60 * 60 * 24);

  if (ageDays <= 30) {
    return {
      score: MatchmakingConstants.SCORE_RECENT_30_DAYS * MatchmakingConstants.WEIGHT_RECENT_ACTIVITY,
      reason: 'Recently active (played in the last 30 days)'
    };
  }
  if (ageDays <= 90) {
    return {
      score: MatchmakingConstants.SCORE_RECENT_90_DAYS * MatchmakingConstants.WEIGHT_RECENT_ACTIVITY,
      reason: 'Active in the last 3 months'
    };
  }

  return { score: 0, reason: '' };
}

export interface RecentActivityInput {
  lastMatchAt: Date | string | null;
}
