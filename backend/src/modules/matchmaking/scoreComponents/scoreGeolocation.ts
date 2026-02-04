/**
 * Geolocation scoring for matchmaking.
 * Goal: Reward candidates closer in physical location.
 * Future: Add venue preferences, travel time, or dynamic location.
 */
import * as MatchmakingConstants from '../matchmaking.constants';

/**
 * Returns a score and reason for location proximity.
 * Future: Add travel time, venue preferences, etc.
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
    let score = 0;
    if (distanceKm < 20) {
      score = 15 * (1 - distanceKm / 20);
    } else if (distanceKm < 35) {
      score = -10 - ((distanceKm - 20) / 15) * 90;
    } else {
      score = -100;
    }
    score = score * MatchmakingConstants.WEIGHT_LOCATION_PROXIMITY;
    return { score, reason: `Distance: ${distanceKm.toFixed(1)} km` };
  }
  if (requesterCity && candidateCity && requesterCity === candidateCity) {
    return { score: 3 * MatchmakingConstants.WEIGHT_LOCATION_PROXIMITY, reason: 'Same city' };
  }
  return { score: 0, reason: 'Location unknown for one or both users' };
}
