// src/modules/matchmaking/scoring/level.score.ts
// Pure function to score level compatibility
// Algorithm: reasonable matches > perfect matches


/**
 * Score level compatibility between two players.
 * Returns 1 for perfect match, 0 for max difference, linear in between.
 * Defensive: treat missing/invalid as 0.
 * @param levelA number
 * @param levelB number
 * @param maxDiff number (default 5)
 */
export function scoreLevel(levelA?: number, levelB?: number, maxDiff = 5): number {
  if (typeof levelA !== 'number' || typeof levelB !== 'number') return 0;
  const diff = Math.abs(levelA - levelB);
  return diff > maxDiff ? 0 : 1 - diff / maxDiff;
}
