/**
 * Availability scoring logic for matchmaking.
 * Goal: Reward candidates with the largest time overlap.
 * Future: Consider venue, surface, or recurring patterns.
 */
import * as MatchmakingConstants from '../matchmaking.constants';
import { ScoreResult } from '../matchmaking.service';

/**
 * Returns a score and reason for the overlap between two availabilities.
 * If no overlap, returns negative score and reason.
 * Future: Add venue/surface logic, recurring slots, etc.
 */
export function scoreAvailabilityOverlap(candidateSlot: AvailabilitySlot, requestSlot: AvailabilitySlot): ScoreResult {
  // If no overlap, return negative score
  if (candidateSlot.end <= requestSlot.start || candidateSlot.start >= requestSlot.end) {
    return { score: -100, reason: 'No overlapping availability' };
  }
  // Overlap exists: score by overlap duration (minutes)
  const overlapStart = new Date(Math.max(candidateSlot.start.getTime(), requestSlot.start.getTime()));
  const overlapEnd = new Date(Math.min(candidateSlot.end.getTime(), requestSlot.end.getTime()));
  const overlapMinutes = Math.max(0, (overlapEnd.getTime() - overlapStart.getTime()) / 60000);
  return {
    score: Math.round(overlapMinutes * MatchmakingConstants.WEIGHT_AVAILABILITY_OVERLAP),
    reason: `Overlapping availability: ${overlapMinutes} minutes`
  };
}

export interface AvailabilitySlot {
  start: Date;
  end: Date;
}
