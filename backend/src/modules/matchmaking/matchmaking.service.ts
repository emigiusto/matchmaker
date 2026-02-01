// src/modules/matchmaking/matchmaking.service.ts
// Pure functions for matchmaking logic
// Algorithm philosophy:
// - Availability first: prioritize who can play
// - Friends over strangers: social connections matter
// - Reasonable matches > perfect matches: optimize for good enough, not perfection


import { MatchCandidate, LevelCompatibility } from './matchmaking.types';
import { scoreAvailability } from './scoring/availability.score';
import { scoreSocial } from './scoring/social.score';
import { scoreLevel } from './scoring/level.score';
import { scoreProximity } from './scoring/proximity.score';

/**
 * Find and score match candidates.
 * Inputs: array of candidates with availability, social, level, and proximity info.
 * Returns: sorted array of MatchCandidate (highest score first).
 * Defensive: skips invalid candidates.
 *
 * @param candidates Array<{ id: string, available: boolean, relationship?: string, levelA?: number, levelB?: number, distanceKm?: number }>
 */
export function findMatchCandidates(candidates: Array<any>): MatchCandidate[] {
  if (!Array.isArray(candidates)) return [];
  return candidates
    .map((c) => {
      if (!c || !c.id) return null;
      // Weighted sum: availability (40%), social (20%), level (20%), proximity (20%)
      const availabilityScore = scoreAvailability(c.available);
      const socialScore = scoreSocial(c.relationship);
      const levelScore = scoreLevel(c.levelA, c.levelB);
      const proximityScore = scoreProximity(c.distanceKm);
      const score =
        0.4 * availabilityScore +
        0.2 * socialScore +
        0.2 * levelScore +
        0.2 * proximityScore;
      return { id: c.id, score };
    })
    .filter(Boolean)
    .sort((a, b) => b.score - a.score);
}

/**
 * Calculate level compatibility between two players.
 * Returns LevelCompatibility object with score and details.
 * Defensive: returns score 0 if invalid input.
 * @param levelA number
 * @param levelB number
 * @param maxDiff number (default 5)
 */
export function calculateLevelCompatibility(levelA?: number, levelB?: number, maxDiff = 5): LevelCompatibility {
  const score = scoreLevel(levelA, levelB, maxDiff);
  return { score };
}

/**
 * Update player levels after a match.
 * Inputs: array of PlayerLevel, match result (e.g., winnerId), and optional adjustment amount.
 * Returns: new array of PlayerLevel with updated levels.
 * Defensive: returns unchanged if invalid input.
 * @param playerLevels Array<{ playerId: string, level: number }>
 * @param winnerId string | undefined
 * @param adjustment number (default 1)
 */
export function updateLevelsAfterMatch(playerLevels: Array<{ playerId: string; level: number }>, winnerId?: string, adjustment = 1): Array<{ playerId: string; level: number }> {
  if (!Array.isArray(playerLevels)) return [];
  return playerLevels.map((pl) => {
    if (!pl || typeof pl.level !== 'number') return pl;
    if (winnerId && pl.playerId === winnerId) {
      return { ...pl, level: pl.level + adjustment };
    } else if (winnerId) {
      return { ...pl, level: Math.max(0, pl.level - adjustment) };
    }
    return pl;
  });
}
