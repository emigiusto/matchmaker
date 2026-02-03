import * as MatchmakingConstants from './matchmaking.constants';
// matchmaking.rules.ts
// Centralized scoring logic for Matchmaking suggestions.
//
// Heuristics are used because matchmaking is not deterministic: we want good, explainable suggestions, not perfection.
// Perfection is not required—transparency and trust are more important for user experience.

/**
 * Score the overlap between two availabilities.
 * Availability overlap is mandatory: if no overlap, return negative score and reason.
 * Returns: { score, reason }
 */
export function scoreAvailabilityOverlap(candidateSlot: { start: Date; end: Date }, requestSlot: { start: Date; end: Date }) {
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

/**
 * Score social proximity between requester and candidate.
 * Friends > previous opponents > community.
 * Social proximity has higher weight than level.
 * Returns: { score, reason }
 */
export function scoreSocialProximity({ isFriend, isPreviousOpponent }: { isFriend: boolean; isPreviousOpponent: boolean }) {
  if (isFriend) return { score: 50 * MatchmakingConstants.WEIGHT_SOCIAL_PROXIMITY, reason: 'You are friends' };
  if (isPreviousOpponent) return { score: 20 * MatchmakingConstants.WEIGHT_SOCIAL_PROXIMITY, reason: 'You have played before' };
  return { score: 0, reason: 'No social connection' };
}

/**
 * Score level compatibility between requester and candidate.
 * Low confidence = wider tolerance, high confidence = stricter.
 * Returns: { score, reason }
 */
/**
 * Score level compatibility between requester and candidate.
 * - If either player has no level or confidence is low (<0.3), return tolerant positive score.
 * - If both have levels:
 *   - Small difference → high score
 *   - Medium difference → small score
 *   - Large difference → negative score
 * No strict cutoffs: uncertainty increases tolerance.
 */
export function scoreLevelCompatibility({
  requesterLevel,
  candidateLevel,
  confidence // 0..1
}: {
  requesterLevel?: number | null;
  candidateLevel?: number | null;
  confidence: number;
}) {
  // Uncertainty-based tolerance: if either level is missing or confidence is low, be tolerant
  if (requesterLevel == null || candidateLevel == null || confidence < 0.3) {
    return {
      score: 10 * MatchmakingConstants.WEIGHT_LEVEL_COMPATIBILITY,
      reason: 'Level unknown or uncertain; being inclusive'
    };
  }
  const diff = Math.abs(requesterLevel - candidateLevel);
  // Small difference (≤0.5): high score
  if (diff <= 0.5) {
    return {
      score: 20 * MatchmakingConstants.WEIGHT_LEVEL_COMPATIBILITY,
      reason: `Very close in level (Δ${diff.toFixed(1)})`
    };
  }
  // Medium difference (≤1.5): small score
  if (diff <= 1.5) {
    return {
      score: 5 * MatchmakingConstants.WEIGHT_LEVEL_COMPATIBILITY,
      reason: `Playable level difference (Δ${diff.toFixed(1)})`
    };
  }
  // Large difference: negative score, but not a hard cutoff
  return {
    score: -5 * MatchmakingConstants.WEIGHT_LEVEL_COMPATIBILITY,
    reason: `Level difference is significant (Δ${diff.toFixed(1)})`
  };
}

/**
 * Score location proximity between requester and candidate.
 * - If both have a city and it's the same, give a small bonus.
 * - Otherwise, if lat/lng present, use geo-distance.
 * - Otherwise, return neutral.
 */
export function scoreLocationProximity({
  requesterLocation,
  candidateLocation,
  requesterCity,
  candidateCity
}: {
  requesterLocation?: { lat?: number; lng?: number; latitude?: number; longitude?: number } | null;
  candidateLocation?: { lat?: number; lng?: number; latitude?: number; longitude?: number } | null;
  requesterCity?: string | null;
  candidateCity?: string | null;
}) {
  // Prefer lat/lng proximity if both are present
  const getLat = (loc: any) => loc?.lat ?? loc?.latitude;
  const getLng = (loc: any) => loc?.lng ?? loc?.longitude;
  const reqLat = getLat(requesterLocation);
  const reqLng = getLng(requesterLocation);
  const candLat = getLat(candidateLocation);
  const candLng = getLng(candidateLocation);

  if (
    typeof reqLat === 'number' && typeof reqLng === 'number' &&
    typeof candLat === 'number' && typeof candLng === 'number'
  ) {
    // Haversine formula for distance in km
    const R = 6371;
    const dLat = (candLat - reqLat) * Math.PI / 180;
    const dLng = (candLng - reqLng) * Math.PI / 180;
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(reqLat * Math.PI / 180) *
      Math.cos(candLat * Math.PI / 180) *
      Math.sin(dLng / 2) * Math.sin(dLng / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const distanceKm = R * c;
    // Score decreases from 15 at 0km to 0 at 20km, then from -10 at 20km to -100 at 35km, and stays -100 for >35km
    let score = 0;
    if (distanceKm < 20) {
      score = 15 * (1 - distanceKm / 20);
    } else if (distanceKm < 35) {
      // Linear from -10 at 20km to -100 at 35km
      score = -10 - ((distanceKm - 20) / 15) * 90; // -10 to -100
    } else {
      score = -100;
    }
    score = score * MatchmakingConstants.WEIGHT_LOCATION_PROXIMITY;
    return { score, reason: `Distance: ${distanceKm.toFixed(1)} km` };
  }
  // Fallback: city match
  if (requesterCity && candidateCity && requesterCity === candidateCity) {
    return { score: 3 * MatchmakingConstants.WEIGHT_LOCATION_PROXIMITY, reason: 'Same city' };
  }
  return { score: 0, reason: 'Location unknown for one or both users' };
}
