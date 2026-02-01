// src/modules/matchmaking/level/level.update.ts
// Pure function to update player levels after a match
// TODO: Implement level update logic


/**
 * Pure function to update a single player's level after a match.
 * Defensive: returns unchanged if invalid input.
 * @param level number
 * @param result 'win' | 'loss' | 'draw'
 * @param adjustment number (default 1)
 * @returns new level
 */
export function updatePlayerLevel(level: number, result: 'win' | 'loss' | 'draw', adjustment = 1): number {
  if (typeof level !== 'number') return level;
  if (result === 'win') return level + adjustment;
  if (result === 'loss') return Math.max(0, level - adjustment);
  return level; // draw or unknown
}
