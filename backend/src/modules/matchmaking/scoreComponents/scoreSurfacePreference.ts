// scoreSurfacePreference.ts
// Computes a bonus score when players share surface preferences (clay, grass, hard, etc.)
// Uses the Player's preferredSurfaces list (PlayerSurface relation) rather than the single
// Availability.preferredSurface string, so it works in both availability and profile modes.
import * as MatchmakingConstants from '../matchmaking.constants';
import { ScoreResult } from '../matchmaking.service';

/**
 * Returns a score and reason for surface preference compatibility.
 *
 * Scoring:
 *   - At least one shared surface: SCORE_SURFACE_MATCH (full match on first shared surface)
 *   - Only one side has preferences (other has none): SCORE_SURFACE_PARTIAL (we can't confirm a clash)
 *   - No shared surfaces and both have explicit preferences: 0 (no bonus, no penalty)
 *   - Neither has preferences: 0, no reason emitted
 */
export function scoreSurfacePreference({ requesterSurfaces, candidateSurfaces }: SurfacePreferenceInput): ScoreResult {
  const reqSet = new Set((requesterSurfaces ?? []).map(s => s.toLowerCase()));
  const candSet = new Set((candidateSurfaces ?? []).map(s => s.toLowerCase()));

  if (reqSet.size === 0 && candSet.size === 0) {
    return { score: 0, reason: '' };
  }

  // Find shared surfaces
  const shared = [...reqSet].filter(s => candSet.has(s));
  if (shared.length > 0) {
    const label = shared[0].charAt(0).toUpperCase() + shared[0].slice(1);
    return {
      score: MatchmakingConstants.SCORE_SURFACE_MATCH * MatchmakingConstants.WEIGHT_SURFACE_PREFERENCE,
      reason: `Both prefer ${label} courts`
    };
  }

  // One side has no preference — partial compatibility
  if (reqSet.size === 0 || candSet.size === 0) {
    return {
      score: MatchmakingConstants.SCORE_SURFACE_PARTIAL * MatchmakingConstants.WEIGHT_SURFACE_PREFERENCE,
      reason: 'Surface preference not specified by one player'
    };
  }

  // Both have preferences but no overlap
  return { score: 0, reason: 'Different surface preferences' };
}

export interface SurfacePreferenceInput {
  requesterSurfaces: string[] | null;
  candidateSurfaces: string[] | null;
}
