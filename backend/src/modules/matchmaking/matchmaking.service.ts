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
// This service takes a user and an availability, finds compatible candidates, and returns ranked, explainable suggestions.
// It never mutates state, creates invites, or sends notifications. Guest users are supported (no Player required).
//
// Models involved: User, Player, Availability, Friendship, Match

import { prisma } from '../../shared/prisma';
import { MatchmakingRequest, MatchmakingResult, MatchmakingCandidate } from './matchmaking.types';
import * as Rules from './matchmaking.rules';

/**
 * findMatchCandidates
 * Main entry point for matchmaking suggestions.
 * @param userId - the user requesting a match
 * @param availabilityId - the availability slot to match for
 * @returns MatchmakingResult (ranked, explainable suggestions)
 */
export async function findMatchCandidates(userId: string, availabilityId: string): Promise<MatchmakingResult> {
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
    const requesterLocation = null;
    const candidateLocation = null;

    // --- Lightweight surface heuristics ---
    let surfaceBonus = 0;
    let surfaceReason = '';
    // TODO: Add surface preference support if/when schema supports it

    // 5. Compute scores using rules, collecting human-readable reasons for each factor
    const reasons: string[] = [];
    let totalScore = 0;

    // Availability overlap (mandatory, always explained)
    const overlapScore = Rules.scoreAvailabilityOverlap(
      { start: candidateAvail.startTime, end: candidateAvail.endTime },
      { start: availability.startTime, end: availability.endTime }
    );
    if (overlapScore.score < 0) {
      reasons.push(overlapScore.reason || 'No overlap');
      continue; // skip incompatible
    }
    totalScore += overlapScore.score;
    if (overlapScore.reason) reasons.push(overlapScore.reason);

    // Social proximity (always explained)
    const socialScore = Rules.scoreSocialProximity({ isFriend, isPreviousOpponent });
    totalScore += socialScore.score;
    if (socialScore.reason) reasons.push(socialScore.reason);

    // Level compatibility (always explained)
    const levelScore = Rules.scoreLevelCompatibility({ requesterLevel, candidateLevel, confidence });
    totalScore += levelScore.score;
    if (levelScore.reason) reasons.push(levelScore.reason);

    // Location proximity (always explained, includes city match logic)
    const locationScore = Rules.scoreLocationProximity({
      requesterLocation,
      candidateLocation,
      requesterCity: requesterPlayer?.defaultCity,
      candidateCity: candidatePlayer?.defaultCity
    });
    totalScore += locationScore.score;
    if (locationScore.reason) reasons.push(locationScore.reason);

    if (surfaceBonus > 0 && surfaceReason) reasons.push(surfaceReason);
    totalScore += surfaceBonus;

    if (totalScore < 10) continue;

    candidates.push({
      candidateUserId: candidateUser.id,
      candidatePlayerId: candidatePlayer?.id ?? null,
      score: totalScore,
      reasons
    });
  }

  // 7. Sort by score DESC
  candidates.sort((a, b) => b.score - a.score);

  // 8. Return explainable results
  return {
    availabilityId,
    candidates
  };
}
