// src/modules/matchmaking/scoring/availability.score.ts
// Pure function to score candidate availability
// Algorithm: prioritize who can play (availability first)


/**
 * Score candidate availability.
 * Returns 1 if available, 0 if not (defensive: treat missing/invalid as 0).
 * Algorithm: prioritize who can play (availability first)
 * @param available boolean
 */
export function scoreAvailability(available: boolean): number {
  return available ? 1 : 0;
}
