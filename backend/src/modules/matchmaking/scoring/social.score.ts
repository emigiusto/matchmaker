// src/modules/matchmaking/scoring/social.score.ts
// Pure function to score social connections
// Algorithm: friends over strangers


/**
 * Score social connection between two users.
 * Returns 1 for friends, 0.5 for acquaintances, 0 for strangers.
 * Defensive: treat missing/invalid as 0.
 * @param relationship 'friend' | 'acquaintance' | 'stranger' | undefined
 */
export function scoreSocial(relationship?: 'friend' | 'acquaintance' | 'stranger'): number {
  if (relationship === 'friend') return 1;
  if (relationship === 'acquaintance') return 0.5;
  return 0;
}
