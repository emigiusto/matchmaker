// src/modules/matchmaking/scoring/proximity.score.ts
// Pure function to score proximity
// Algorithm: prioritize closer candidates


/**
 * Score proximity between two locations (in km).
 * Returns 1 for same location, 0 for max distance, linear in between.
 * Defensive: treat missing/invalid as 0.
 * @param distanceKm number
 * @param maxDistance number (default 20)
 */
export function scoreProximity(distanceKm?: number, maxDistance = 20): number {
  if (typeof distanceKm !== 'number') return 0;
  return distanceKm >= maxDistance ? 0 : 1 - distanceKm / maxDistance;
}
