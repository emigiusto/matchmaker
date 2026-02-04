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

/**
 * findMatchCandidates
 * Main entry point for matchmaking suggestions.
 * @param userId - the user requesting a match
 * @param availabilityId - the availability slot to match for
 * @returns MatchmakingResult (ranked, explainable suggestions)
 */
export async function findMatchCandidates(userId: string, availabilityId: string): Promise<MatchmakingResult> {
  // 0. Try cache first
  const cacheKey = `matchmaking:${userId}:${availabilityId}`;
  const cachedResult = await tryCacheGet(cacheKey);
  if (cachedResult) return cachedResult;

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

  // Preload all candidate users
  const candidateUserIds = overlappingAvailabilities.map(a => a.userId);
  const candidateUsersArr = await prisma.user.findMany({ where: { id: { in: candidateUserIds } } });
  const candidateUsers = new Map(candidateUsersArr.map(u => [u.id, u]));

  // Preload all candidate players
  const candidatePlayersArr = await prisma.player.findMany({ where: { userId: { in: candidateUserIds } } });
  const candidatePlayers = new Map(candidatePlayersArr.map(p => [p.userId, p]));

  // Preload requester player
  const requesterPlayer = await prisma.player.findUnique({ where: { userId } });

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

    // --- Lightweight surface heuristics ---
    let surfaceBonus = 0;
    let surfaceReason = '';
    // TODO: Add surface preference support if/when schema supports it

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
    const overlapScore = scoreAvailabilityOverlap(
      { start: candidateAvail.startTime, end: candidateAvail.endTime },
      { start: availability.startTime, end: availability.endTime }
    );
    if (overlapScore.score < 0) {
      reasons.push(overlapScore.reason || 'No overlap');
      continue; // skip incompatible
    }
    if (overlapScore.reason) reasons.push(overlapScore.reason);

    // Social proximity (always explained)
    const socialScore = scoreSocialProximity({ isFriend, isPreviousOpponent });
    if (socialScore.reason) reasons.push(socialScore.reason);

    // Level compatibility (always explained)
    const levelScore = scoreLevelCompatibility({ requesterLevel, candidateLevel, confidence });
    if (levelScore.reason) reasons.push(levelScore.reason);

    // Location proximity (always explained, includes city and lat/lng logic)
    const locationScore = scoreLocationProximity({
      requesterLocation,
      candidateLocation,
      requesterCity: requesterPlayer?.defaultCity,
      candidateCity: candidatePlayer?.defaultCity
    });
    if (locationScore.reason) reasons.push(locationScore.reason);

    // Recent activity (future expansion)
    const recentActivityScore = require('./scoreComponents/scoreRecentActivity').scoreRecentActivity({ candidateUserId: candidateUser.id });
    if (recentActivityScore.reason) reasons.push(recentActivityScore.reason);

    // Reliability (future expansion)
    const reliabilityScore = require('./scoreComponents/scoreReliability').scoreReliability({ candidateUserId: candidateUser.id });
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

    if (totalScore < MatchmakingConstants.MIN_SCORE) continue;

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
      candidateAvailabilityId: candidateAvail.id
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
async function tryCacheGet(cacheKey: string): Promise<MatchmakingResult | null> {
  try {
    const cached = await cacheGet(cacheKey);
    if (cached) return JSON.parse(cached);
  } catch (err) {
    console.log('Matchmaking cache get error:', err);
    // Cache unavailable or error, ignore
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
 * @param userId Optional userId to clear only that user's cache. If omitted, clears all matchmaking cache.
 */
export async function clearMatchmakingCache(userId?: string): Promise<void> {
  const pattern = userId ? `matchmaking:${userId}:*` : 'matchmaking:*';
  await deleteKeysByPattern(pattern);
}
