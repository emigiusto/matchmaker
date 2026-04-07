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
//
// Two matching modes (both run automatically and are merged into one ranked feed):
//   'availability' - both users have overlapping open availability slots; includes overlap bonus
//   'profile'      - matched on player profile attributes only (level, location, surface, etc.)
//                    no availability is required from either side
//
// The caller never chooses a mode. findAllMatchCandidatesForUser always runs both and merges.
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

// ─────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────

/**
 * findAllMatchCandidatesForUser
 *
 * Main entry point for the "Suggested Opponents" feed.
 * Always returns results — even if the user has no open availabilities.
 *
 * Strategy:
 *   1. Run profile-based discovery against all other players.
 *   2. If the user has open future availabilities, also run availability-based matching
 *      for each slot and merge the results.
 *   3. Deduplicate by candidateUserId: availability-mode result wins over profile-mode.
 *   4. Sort by score descending and return topN.
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

  const filters = {
    minScore: options?.minScore,
    maxDistanceKm: options?.maxDistanceKm,
    minLevel: options?.minLevel,
    maxLevel: options?.maxLevel
  };

  // 1. Always run profile-based discovery
  const profileCandidates = await findProfileBasedCandidates(userId, filters);

  // 2. Run availability-based matching for each open slot (if any)
  const now = new Date();
  const availabilities = await prisma.availability.findMany({
    where: { userId, status: 'open', endTime: { gt: now } }
  });

  const availCandidateMap = new Map<string, MatchmakingCandidate>();
  for (const avail of availabilities) {
    const result = await findMatchCandidates(userId, avail.id, filters);
    for (const candidate of result.candidates) {
      const existing = availCandidateMap.get(candidate.candidateUserId);
      if (!existing || candidate.score > existing.score) {
        availCandidateMap.set(candidate.candidateUserId, {
          ...candidate,
          requesterAvailabilityId: avail.id
        });
      }
    }
  }

  // 3. Merge: availability-mode wins on duplicate candidateUserId
  const merged = new Map<string, MatchmakingCandidate>();
  for (const c of profileCandidates) {
    merged.set(c.candidateUserId, c);
  }
  for (const [userId, c] of availCandidateMap) {
    merged.set(userId, c); // overwrites profile result if both exist
  }

  // 4. Sort by score descending, take topN
  const sorted = [...merged.values()].sort((a, b) => b.score - a.score).slice(0, topN);
  await tryCacheSet(cacheKey, sorted, 60 * 60 * 12);
  return sorted;
}

/**
 * findMatchCandidates
 * Availability-based matching for a specific availability slot.
 * Requires both users to have overlapping open availability.
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
  const cacheKey = `matchmaking:${userId}:${availabilityId}` +
    `:minScore${filters?.minScore ?? ''}` +
    `:maxDist${filters?.maxDistanceKm ?? ''}` +
    `:minLevel${filters?.minLevel ?? ''}` +
    `:maxLevel${filters?.maxLevel ?? ''}`;

  if (!filters?.forceRefresh) {
    const cachedResult = await tryCacheGet(cacheKey);
    if (cachedResult) return cachedResult;
  }

  const [user, availability] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId } }),
    prisma.availability.findUnique({ where: { id: availabilityId } })
  ]);
  if (!user) throw new Error('User not found');
  if (!availability) throw new Error('Availability not found');

  const overlappingAvailabilities = await prisma.availability.findMany({
    where: {
      id: { not: availabilityId },
      userId: { not: userId },
      date: availability.date,
      startTime: { lt: availability.endTime },
      endTime: { gt: availability.startTime }
    }
  });

  const candidateUserIds = overlappingAvailabilities.map(a => a.userId);

  const [candidateUsersArr, candidatePlayersArr, requesterPlayer] = await Promise.all([
    findUsersByIdsCached(candidateUserIds),
    PlayersService.findPlayersByUserIdsCached(candidateUserIds),
    PlayersService.findPlayerByUserIdCached(userId).catch(() => null)
  ]);

  const candidateUsers = new Map(candidateUsersArr.map(u => [u.id, u]));
  const candidatePlayers = new Map(candidatePlayersArr.map(p => [p.userId, p]));

  const contactLinks = await prisma.contact.findMany({
    where: {
      OR: [
        { ownerUserId: userId, linkedUserId: { in: candidateUserIds } },
        { ownerUserId: { in: candidateUserIds }, linkedUserId: userId }
      ]
    },
    select: { ownerUserId: true, linkedUserId: true }
  });
  const friendPairs = new Set(contactLinks.map(c => `${c.ownerUserId}|${c.linkedUserId}`));

  const requesterPlayerId = requesterPlayer?.id;
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
    matchPairs = new Set(matches.map(m => `${m.playerAId}|${m.playerBId}`));
  }

  const requesterSurfaces = requesterPlayer?.preferredSurfaces ?? [];

  const candidates: MatchmakingCandidate[] = [];

  for (const candidateAvail of overlappingAvailabilities) {
    const candidateUser = candidateUsers.get(candidateAvail.userId);
    if (!candidateUser) continue;
    const candidatePlayer = candidatePlayers.get(candidateAvail.userId);

    const isFriend = friendPairs.has(`${userId}|${candidateUser.id}`) || friendPairs.has(`${candidateUser.id}|${userId}`);
    let isPreviousOpponent = false;
    if (requesterPlayerId && candidatePlayer) {
      isPreviousOpponent =
        matchPairs.has(`${requesterPlayerId}|${candidatePlayer.id}`) ||
        matchPairs.has(`${candidatePlayer.id}|${requesterPlayerId}`);
    }

    const requesterLevel = requesterPlayer?.levelValue ?? null;
    const candidateLevel = candidatePlayer?.levelValue ?? null;
    const confidence =
      requesterPlayer?.levelConfidence != null && candidatePlayer?.levelConfidence != null
        ? Math.min(requesterPlayer.levelConfidence, candidatePlayer.levelConfidence)
        : (requesterLevel != null && candidateLevel != null ? 1 : 0.3);

    const requesterLocation =
      requesterPlayer?.latitude != null && requesterPlayer?.longitude != null
        ? { latitude: requesterPlayer.latitude, longitude: requesterPlayer.longitude }
        : null;
    const candidateLocation =
      candidatePlayer?.latitude != null && candidatePlayer?.longitude != null
        ? { latitude: candidatePlayer.latitude, longitude: candidatePlayer.longitude }
        : null;

    const overlapStart = new Date(Math.max(candidateAvail.startTime.getTime(), availability.startTime.getTime()));
    const overlapEnd = new Date(Math.min(candidateAvail.endTime.getTime(), availability.endTime.getTime()));
    const overlapMinutes = (overlapEnd.getTime() - overlapStart.getTime()) / 60000;
    if (overlapMinutes < MatchmakingConstants.MIN_OVERLAP_MINUTES) continue;

    const overlapScore = scoreAvailabilityOverlap(
      { start: candidateAvail.startTime, end: candidateAvail.endTime },
      { start: availability.startTime, end: availability.endTime }
    );
    if (overlapScore.score < 0) continue;

    const socialScore = scoreSocialProximity({ isFriend, isPreviousOpponent });
    const levelScore = scoreLevelCompatibility({ requesterLevel, candidateLevel, confidence });
    const locationScore = scoreLocationProximity({
      requesterLocation,
      candidateLocation,
      requesterCity: requesterPlayer?.defaultCity,
      candidateCity: candidatePlayer?.defaultCity
    });
    const surfaceScore = scoreSurfacePreference({
      requesterSurfaces,
      candidateSurfaces: candidatePlayer?.preferredSurfaces ?? []
    });
    const recentActivityScore = scoreRecentActivity({ lastMatchAt: candidatePlayer?.lastMatchAt ?? null });
    const reliabilityScore = scoreReliability({ candidateUserId: candidateUser.id });

    const reasons: string[] = [];
    if (overlapScore.reason) reasons.push(overlapScore.reason);
    if (socialScore.reason) reasons.push(socialScore.reason);
    if (levelScore.reason) reasons.push(levelScore.reason);
    if (locationScore.reason) reasons.push(locationScore.reason);
    if (surfaceScore.score > 0 && surfaceScore.reason) reasons.push(surfaceScore.reason);
    if (recentActivityScore.score > 0 && recentActivityScore.reason) reasons.push(recentActivityScore.reason);
    if (reliabilityScore.reason) reasons.push(reliabilityScore.reason);

    const scoreBreakdown = {
      availability: overlapScore.score,
      social: socialScore.score,
      level: levelScore.score,
      location: locationScore.score,
      surface: surfaceScore.score,
      recentActivity: recentActivityScore.score
    };
    const totalScore = Object.values(scoreBreakdown).reduce((a, b) => a + b, 0) + reliabilityScore.score;

    if (totalScore < MatchmakingConstants.MIN_SCORE) continue;
    if (filters?.minScore != null && totalScore < filters.minScore) continue;
    if (filters?.minLevel != null && candidateLevel != null && candidateLevel < filters.minLevel) continue;
    if (filters?.maxLevel != null && candidateLevel != null && candidateLevel > filters.maxLevel) continue;
    if (filters?.maxDistanceKm != null && requesterLocation && candidateLocation) {
      const dist = haversineDistanceKm(requesterLocation.latitude, requesterLocation.longitude, candidateLocation.latitude, candidateLocation.longitude);
      if (dist > filters.maxDistanceKm) continue;
    }

    candidates.push({
      candidateUserId: candidateUser.id,
      candidatePlayerId: candidatePlayer?.id ?? null,
      score: totalScore,
      scoreBreakdown,
      reasons,
      matchMode: 'availability',
      hasOpenAvailability: true, // by definition — they have an overlapping open slot
      overlapRange: { start: overlapStart.toISOString(), end: overlapEnd.toISOString() },
      requesterAvailabilityId: availabilityId,
      candidateAvailabilityId: candidateAvail.id,
      candidateLevel: candidateLevel ?? 0,
      candidateLocation
    });
  }

  candidates.sort((a, b) => b.score - a.score);
  const result: MatchmakingResult = { availabilityId, candidates };
  await tryCacheSet(cacheKey, result, 60);
  return result;
}

/**
 * findProfileBasedCandidates
 *
 * Profile-only matching: scores every other player based on level, location,
 * social proximity, surface preference, and recent activity — with no availability requirement.
 *
 * Candidates with an open future availability receive AVAILABILITY_BONUS points,
 * so they naturally rank higher than profile-only matches without an open slot.
 */
export async function findProfileBasedCandidates(
  userId: string,
  filters?: {
    minScore?: number;
    maxDistanceKm?: number;
    minLevel?: number;
    maxLevel?: number;
  }
): Promise<MatchmakingCandidate[]> {
  const requesterPlayer = await PlayersService.findPlayerByUserIdCached(userId).catch(() => null);

  // Load all other active players
  const allPlayers = await PlayersService.listPlayers();
  const otherPlayers = allPlayers.filter(p => p.userId !== userId);

  if (otherPlayers.length === 0) return [];

  const candidateUserIds = otherPlayers.map(p => p.userId);

  // Resolve which candidates have open future availability (single query)
  const now = new Date();
  const openAvailRows = await prisma.availability.findMany({
    where: { userId: { in: candidateUserIds }, status: 'open', endTime: { gt: now } },
    select: { userId: true },
    distinct: ['userId']
  });
  const usersWithOpenAvailability = new Set(openAvailRows.map(r => r.userId));

  // Preload social graph
  const contactLinks = await prisma.contact.findMany({
    where: {
      OR: [
        { ownerUserId: userId, linkedUserId: { in: candidateUserIds } },
        { ownerUserId: { in: candidateUserIds }, linkedUserId: userId }
      ]
    },
    select: { ownerUserId: true, linkedUserId: true }
  });
  const friendPairs = new Set(contactLinks.map(c => `${c.ownerUserId}|${c.linkedUserId}`));

  // Preload match history
  const requesterPlayerId = requesterPlayer?.id;
  const candidatePlayerIds = otherPlayers.map(p => p.id);
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
    matchPairs = new Set(matches.map(m => `${m.playerAId}|${m.playerBId}`));
  }

  const requesterLevel = requesterPlayer?.levelValue ?? null;
  const requesterSurfaces = requesterPlayer?.preferredSurfaces ?? [];
  const requesterLocation =
    requesterPlayer?.latitude != null && requesterPlayer?.longitude != null
      ? { latitude: requesterPlayer.latitude, longitude: requesterPlayer.longitude }
      : null;

  const candidates: MatchmakingCandidate[] = [];

  for (const candidatePlayer of otherPlayers) {
    const candidateLevel = candidatePlayer.levelValue ?? null;

    // Apply hard level filters early
    if (filters?.minLevel != null && candidateLevel != null && candidateLevel < filters.minLevel) continue;
    if (filters?.maxLevel != null && candidateLevel != null && candidateLevel > filters.maxLevel) continue;

    const isFriend = friendPairs.has(`${userId}|${candidatePlayer.userId}`) || friendPairs.has(`${candidatePlayer.userId}|${userId}`);
    const isPreviousOpponent = requesterPlayerId
      ? matchPairs.has(`${requesterPlayerId}|${candidatePlayer.id}`) || matchPairs.has(`${candidatePlayer.id}|${requesterPlayerId}`)
      : false;

    const confidence =
      requesterPlayer?.levelConfidence != null && candidatePlayer.levelConfidence != null
        ? Math.min(requesterPlayer.levelConfidence, candidatePlayer.levelConfidence)
        : (requesterLevel != null && candidateLevel != null ? 1 : 0.3);

    const candidateLocation =
      candidatePlayer.latitude != null && candidatePlayer.longitude != null
        ? { latitude: candidatePlayer.latitude, longitude: candidatePlayer.longitude }
        : null;

    // Apply distance filter early
    if (filters?.maxDistanceKm != null && requesterLocation && candidateLocation) {
      const dist = haversineDistanceKm(requesterLocation.latitude, requesterLocation.longitude, candidateLocation.latitude, candidateLocation.longitude);
      if (dist > filters.maxDistanceKm) continue;
    }

    const socialScore = scoreSocialProximity({ isFriend, isPreviousOpponent });
    const levelScore = scoreLevelCompatibility({ requesterLevel, candidateLevel, confidence });
    const locationScore = scoreLocationProximity({
      requesterLocation,
      candidateLocation,
      requesterCity: requesterPlayer?.defaultCity,
      candidateCity: candidatePlayer.defaultCity
    });
    const surfaceScore = scoreSurfacePreference({
      requesterSurfaces,
      candidateSurfaces: candidatePlayer.preferredSurfaces ?? []
    });
    const recentActivityScore = scoreRecentActivity({ lastMatchAt: candidatePlayer.lastMatchAt ?? null });

    const hasOpenAvailability = usersWithOpenAvailability.has(candidatePlayer.userId);
    const availabilityBonus = hasOpenAvailability ? MatchmakingConstants.AVAILABILITY_BONUS : 0;

    const scoreBreakdown = {
      social: socialScore.score,
      level: levelScore.score,
      location: locationScore.score,
      surface: surfaceScore.score,
      recentActivity: recentActivityScore.score,
      availability: availabilityBonus
    };
    const totalScore = Object.values(scoreBreakdown).reduce((a, b) => a + b, 0);

    if (totalScore < MatchmakingConstants.MIN_SCORE) continue;
    if (filters?.minScore != null && totalScore < filters.minScore) continue;

    const reasons: string[] = [];
    if (socialScore.reason) reasons.push(socialScore.reason);
    if (levelScore.reason) reasons.push(levelScore.reason);
    if (locationScore.reason) reasons.push(locationScore.reason);
    if (surfaceScore.score > 0 && surfaceScore.reason) reasons.push(surfaceScore.reason);
    if (recentActivityScore.score > 0 && recentActivityScore.reason) reasons.push(recentActivityScore.reason);
    if (hasOpenAvailability) reasons.push('Has open availability');

    candidates.push({
      candidateUserId: candidatePlayer.userId,
      candidatePlayerId: candidatePlayer.id,
      score: totalScore,
      scoreBreakdown,
      reasons,
      matchMode: 'profile',
      hasOpenAvailability,
      candidateLevel: candidateLevel ?? 0,
      candidateLocation
    });
  }

  candidates.sort((a, b) => b.score - a.score);
  return candidates;
}

// ─────────────────────────────────────────────────────────────
// Cache management
// ─────────────────────────────────────────────────────────────

/**
 * Clears the matchmaking cache for all users or a specific user.
 * Should be called when any user publishes a new availability.
 */
export async function clearMatchmakingCache(userId?: string): Promise<void> {
  const patterns = userId
    ? [`matchmaking:${userId}:*`, `matchmaking:allCandidates:${userId}:*`]
    : ['matchmaking:*', 'matchmaking:allCandidates:*'];
  for (const pattern of patterns) {
    await deleteKeysByPattern(pattern);
  }
}

// ─────────────────────────────────────────────────────────────
// Internal helpers
// ─────────────────────────────────────────────────────────────

async function tryCacheGet(cacheKey: string): Promise<any | null> {
  try {
    const cached = await cacheGet(cacheKey);
    if (cached) return JSON.parse(cached);
  } catch {
    // ignore cache errors
  }
  return null;
}

async function tryCacheSet(cacheKey: string, value: any, ttlSeconds: number) {
  try {
    await cacheSet(cacheKey, JSON.stringify(value), ttlSeconds);
  } catch {
    // ignore cache errors
  }
}

function haversineDistanceKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
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
