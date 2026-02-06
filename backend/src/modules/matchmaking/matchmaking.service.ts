// matchmaking.service.ts
// Core matchmaking suggestion engine (read-only, pure)
//
// INVARIANTS & CONSTRAINTS:
// - No writes to the database (read-only queries only)
// - No Invite creation
// - No Match creation
// - No Notification creation
// - No side effects of any kind
// - Results are deterministic for the same inputs (pure function of DB state)
// This service takes a user and an availability, finds compatible candidates, and returns ranked, explainable suggestions.
// It never mutates state, creates invites, or sends notifications. Guest users are supported (no Player required).
import { MatchmakingResult, MatchmakingCandidate } from './matchmaking.types';
import * as MatchmakingConstants from './matchmaking.constants';
import { cacheGet, cacheSet } from '../../shared/cache/redis';
import { deleteKeysByPattern } from '../../shared/cache/redis';
import { prisma } from '../../prisma';
import { scoreAvailabilityOverlap } from './scoreComponents/scoreAvailability';
import { scoreSocialProximity } from './scoreComponents/scoreSocialProximity';
import { scoreLevelCompatibility } from './scoreComponents/scoreLevelCloseness';
import { scoreLocationProximity } from './scoreComponents/scoreGeolocation';
import { scoreSurfacePreference } from './scoreComponents/scoreSurfacePreference';
import { scoreRecentActivity } from './scoreComponents/scoreRecentActivity';
import { scoreReliability } from './scoreComponents/scoreReliability';
import { findUsersByIdsCached } from '../users/users.service';
import { PlayersService } from '../players/players.service';

/**
 * Finds all candidate availabilities for all of a user's open, future availabilities.
 * Returns top N candidates, sorted by score descending, with caching and filtering.
 * @param userId - the user requesting candidates
 * @param options - { topN?: number, minScore?: number, forceRefresh?: boolean }
 */
export async function findAllMatchCandidatesForUser(
  userId: string,
  options?: {
    topN?: number;
    minScore?: number;
    forceRefresh?: boolean;
    maxDistanceKm?: number;
    minLevel?: number;
    maxLevel?: number;
  }
): Promise<MatchmakingCandidate[]> {
  const topN = options?.topN ?? 10;
  const forceRefresh = options?.forceRefresh ?? false;
  const cacheKey = `matchmaking:allCandidates:${userId}:top${topN}:minScore${options?.minScore ?? ''}:maxDist${options?.maxDistanceKm ?? ''}:minLevel${options?.minLevel ?? ''}:maxLevel${options?.maxLevel ?? ''}`;
  if (!forceRefresh) {
    const cached = await tryCacheGet(cacheKey);
    if (cached) return cached;
  }
  
  const now = new Date();
  // 1. Get all own availabilities that are open and in the future
  const availabilities = await prisma.availability.findMany({
    where: {
      userId,
      status: 'open',
      endTime: { gt: now }
    }
  });
  const allCandidates: MatchmakingCandidate[] = [];
  for (const avail of availabilities) {
    if (avail.userId !== userId) continue;
    const result = await findMatchCandidates(userId, avail.id, {
      minScore: options?.minScore,
      maxDistanceKm: options?.maxDistanceKm,
      minLevel: options?.minLevel,
      maxLevel: options?.maxLevel
    });
    for (const candidate of result.candidates) {
      allCandidates.push({ ...candidate, requesterAvailabilityId: avail.id });
    }
  }
  // Sort all candidates by score descending
  allCandidates.sort((a, b) => b.score - a.score);
  // Return only top N
  const topCandidates = allCandidates.slice(0, topN);
  await tryCacheSet(cacheKey, topCandidates, 60 * 60 * 12); // cache for 12 hours
  return topCandidates;
}

/**
 * findMatchCandidates
 * Main entry point for matchmaking suggestions.
 * @param userId - the user requesting a match
 * @param availabilityId - the availability slot to match for
 * @returns MatchmakingResult (ranked, explainable suggestions)
 */
export async function findMatchCandidates(
  userId: string,
  availabilityId: string,
  filters?: {
    minScore?: number;
    maxDistanceKm?: number;
    minLevel?: number;
    maxLevel?: number;
    forceRefresh?: boolean;
  }
): Promise<MatchmakingResult> {
  // 0. Try cache first
  const cacheKey = `matchmaking:${userId}:${availabilityId}` +
    `:minScore${filters?.minScore ?? ''}` +
    `:maxDist${filters?.maxDistanceKm ?? ''}` +
    `:minLevel${filters?.minLevel ?? ''}` +
    `:maxLevel${filters?.maxLevel ?? ''}`;
    
  if (!filters?.forceRefresh) {
    const cachedResult = await tryCacheGet(cacheKey);
    if (cachedResult) return cachedResult;
  }

  // 1. Load user and availability
  const [user, availability] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId } }),
    prisma.availability.findUnique({ where: { id: availabilityId } })
  ]);
  if (!user) throw new Error('User not found');
  if (!availability) throw new Error('Availability not found');

  // 2. Find all overlapping availabilities (exclude self)
  const overlappingAvailabilities = await prisma.availability.findMany({
    where: {
      id: { not: availabilityId },
      userId: { not: userId },
      date: availability.date,
      startTime: { lt: availability.endTime },
      endTime: { gt: availability.startTime }
    }
  });

  // Preload all candidate users and players using cached methods
  const candidateUserIds = overlappingAvailabilities.map(a => a.userId);

  const candidateUsersArr = await findUsersByIdsCached(candidateUserIds);
  const candidateUsers = new Map(candidateUsersArr.map(u => [u.id, u]));

  const candidatePlayersArr = await PlayersService.findPlayersByUserIdsCached(candidateUserIds);
  const candidatePlayers = new Map(candidatePlayersArr.map(p => [p.userId, p]));

  // Preload requester player
  const requesterPlayer = await PlayersService.findPlayerByUserIdCached(userId);

  // Preload all friendships (bidirectional)
  const friendships = await prisma.friendship.findMany({
    where: {
      OR: [
        { userId, friendUserId: { in: candidateUserIds } },
        { friendUserId: userId, userId: { in: candidateUserIds } }
      ]
    }
  });
  // Build a set of friend pairs for quick lookup
  const friendPairs = new Set(
    friendships.map(f => `${f.userId}|${f.friendUserId}`)
  );

  // Preload all matches between requester and candidates
  let requesterPlayerId = requesterPlayer?.id;
  const candidatePlayerIds = candidatePlayersArr.map(p => p.id);
  let matchPairs = new Set<string>();
  if (requesterPlayerId) {
    const matches = await prisma.match.findMany({
      where: {
        OR: [
          { playerAId: requesterPlayerId, playerBId: { in: candidatePlayerIds } },
          { playerBId: requesterPlayerId, playerAId: { in: candidatePlayerIds } }
        ]
      }
    });
    matchPairs = new Set(
      matches.map(m => `${m.playerAId}|${m.playerBId}`)
    );
  }

  // 3. For each overlapping availability, build a candidate suggestion with human-readable reasons.
  const candidates: MatchmakingCandidate[] = [];
  for (const candidateAvail of overlappingAvailabilities) {
    const candidateUser = candidateUsers.get(candidateAvail.userId);
    if (!candidateUser) continue;
    const candidatePlayer = candidatePlayers.get(candidateAvail.userId);

    // --- Social proximity: explain WHY this person is suggested ---
    // Friends: any explicit Friendship row (bidirectional) means friend
    // TODO: In future, add status field to Friendship for pending/accepted distinction
    // Previous opponents: check Match history (played together as playerA/playerB)
    // Community: neither friend nor previous opponent
    // Friends score highest, then previous opponents, then community
    const isFriend = friendPairs.has(`${userId}|${candidateUser.id}`) || friendPairs.has(`${candidateUser.id}|${userId}`);
    let isPreviousOpponent = false;
    if (requesterPlayerId && candidatePlayer) {
      isPreviousOpponent =
        matchPairs.has(`${requesterPlayerId}|${candidatePlayer.id}`) ||
        matchPairs.has(`${candidatePlayer.id}|${requesterPlayerId}`);
    }
    // --- End social proximity ---

    // Level compatibility (optional, tolerant if missing)
    const requesterLevel = requesterPlayer?.levelValue ?? null;
    const candidateLevel = candidatePlayer?.levelValue ?? null;
    const confidence =
      requesterPlayer?.levelConfidence != null && candidatePlayer?.levelConfidence != null
        ? Math.min(requesterPlayer.levelConfidence, candidatePlayer.levelConfidence)
        : (requesterLevel != null && candidateLevel != null ? 1 : 0.3);

    // Location (optional)
    const requesterLocation =
      requesterPlayer && requesterPlayer.latitude != null && requesterPlayer.longitude != null
        ? { latitude: requesterPlayer.latitude, longitude: requesterPlayer.longitude }
        : null;
    const candidateLocation =
      candidatePlayer && candidatePlayer.latitude != null && candidatePlayer.longitude != null
        ? { latitude: candidatePlayer.latitude, longitude: candidatePlayer.longitude }
        : null;

    // --- Surface preference ---
    // Use preferredSurface from Availability
    const requesterSurface = availability.preferredSurface ?? null;
    const candidateSurface = candidateAvail.preferredSurface ?? null;
    const surfaceScoreObj: ScoreResult = scoreSurfacePreference({ requesterSurface, candidateSurface });
    const surfaceBonus = surfaceScoreObj.score;
    const surfaceReason = surfaceScoreObj.reason;

    // 5. Compute scores using rules, collecting human-readable reasons for each factor
    const reasons: string[] = [];
    let totalScore = 0;

    // Calculate overlap range as two date objects (ISO strings)
    const overlapStart = new Date(Math.max(candidateAvail.startTime.getTime(), availability.startTime.getTime()));
    const overlapEnd = new Date(Math.min(candidateAvail.endTime.getTime(), availability.endTime.getTime()));
    // Enforce minimum overlap duration
    const overlapMinutes = (overlapEnd.getTime() - overlapStart.getTime()) / 60000;
    if (overlapMinutes < MatchmakingConstants.MIN_OVERLAP_MINUTES) continue;

    // Availability overlap (mandatory, always explained)
    const overlapScore: ScoreResult = scoreAvailabilityOverlap(
      { start: candidateAvail.startTime, end: candidateAvail.endTime },
      { start: availability.startTime, end: availability.endTime }
    );
    if (overlapScore.score < 0) {
      reasons.push(overlapScore.reason || 'No overlap');
      continue; // skip incompatible
    }
    if (overlapScore.reason) reasons.push(overlapScore.reason);

    // Social proximity (always explained)
    const socialScore: ScoreResult = scoreSocialProximity({ isFriend, isPreviousOpponent });
    if (socialScore.reason) reasons.push(socialScore.reason);

    // Level compatibility (always explained)
    const levelScore: ScoreResult = scoreLevelCompatibility({ requesterLevel, candidateLevel, confidence });
    if (levelScore.reason) reasons.push(levelScore.reason);

    // Location proximity (always explained, includes city and lat/lng logic)
    const locationScore: ScoreResult = scoreLocationProximity({
      requesterLocation,
      candidateLocation,
      requesterCity: requesterPlayer?.defaultCity,
      candidateCity: candidatePlayer?.defaultCity
    });
    if (locationScore.reason) reasons.push(locationScore.reason);

    // Recent activity (future expansion)
    const recentActivityScore: ScoreResult = scoreRecentActivity({ candidateUserId: candidateUser.id });
    if (recentActivityScore.reason) reasons.push(recentActivityScore.reason);

    // Reliability (future expansion)
    const reliabilityScore: ScoreResult = scoreReliability({ candidateUserId: candidateUser.id });
    if (reliabilityScore.reason) reasons.push(reliabilityScore.reason);

    if (surfaceBonus > 0 && surfaceReason) reasons.push(surfaceReason);

    // Score breakdown
    const scoreBreakdown = {
      availability: overlapScore.score,
      social: socialScore.score,
      level: levelScore.score,
      location: locationScore.score,
      recentActivity: recentActivityScore.score,
      reliability: reliabilityScore.score,
      surface: surfaceBonus
    };
    totalScore = scoreBreakdown.availability + scoreBreakdown.social + scoreBreakdown.level + scoreBreakdown.location + scoreBreakdown.recentActivity + scoreBreakdown.reliability + scoreBreakdown.surface;
    // Apply filters
    if (totalScore < MatchmakingConstants.MIN_SCORE) continue;
    if (filters) {
      if (filters.minScore != null && totalScore < filters.minScore) continue;
      if (filters.minLevel != null && candidateLevel != null && candidateLevel < filters.minLevel) continue;
      if (filters.maxLevel != null && candidateLevel != null && candidateLevel > filters.maxLevel) continue;
      if (filters.maxDistanceKm != null && requesterLocation && candidateLocation) {
        const dist = haversineDistanceKm(requesterLocation.latitude, requesterLocation.longitude, candidateLocation.latitude, candidateLocation.longitude);
        if (dist > filters.maxDistanceKm) continue;
      }
    }
    candidates.push({
      candidateUserId: candidateUser.id,
      candidatePlayerId: candidatePlayer?.id ?? null,
      score: totalScore,
      scoreBreakdown,
      reasons,
      overlapRange: {
        start: overlapStart.toISOString(),
        end: overlapEnd.toISOString()
      },
      requesterAvailabilityId: availabilityId,
      candidateAvailabilityId: candidateAvail.id,
      candidateLevel: candidateLevel ?? 0,
      candidateLocation
    });
  }

  // 7. Sort by score DESC
  candidates.sort((a, b) => b.score - a.score);

  // 8. Return explainable results
  const result = {
    availabilityId,
    candidates
  };

  await tryCacheSet(cacheKey, result, 60);
  return result;
}

// Private cache helpers
async function tryCacheGet(cacheKey: string): Promise<any | null> {
  try {
    const cached = await cacheGet(cacheKey);
    if (cached) return JSON.parse(cached);
  } catch (err) {
    console.log('Matchmaking cache get error:', err);
  }
  return null;
}

async function tryCacheSet(cacheKey: string, value: any, ttlSeconds: number) {
  try {
    await cacheSet(cacheKey, JSON.stringify(value), ttlSeconds);
  } catch (err) {
    console.log('Matchmaking cache set error:', err);
  }
}

/**
 * Clears the matchmaking cache for all users or a specific user.
 * Should be called when any user publishes a new availability, as this can affect candidate results.
 * @param userId Optional userId to clear only that user's cache. If omitted, clears all matchmaking cache.
 */
export async function clearMatchmakingCache(userId?: string): Promise<void> {
  // Clear both single and allCandidates cache
  const patterns = userId
    ? [`matchmaking:${userId}:*`, `matchmaking:allCandidates:${userId}:*`]
    : ['matchmaking:*', 'matchmaking:allCandidates:*'];
  for (const pattern of patterns) {
    await deleteKeysByPattern(pattern);
  }
}

// Helper: Haversine formula for distance in km
function haversineDistanceKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371; // Earth radius in km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}


// Common interface for all score results
export interface ScoreResult {
  score: number;
  reason: string;
}