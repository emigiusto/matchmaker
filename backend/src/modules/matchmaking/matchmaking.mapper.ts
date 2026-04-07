// matchmaking.mapper.ts
// Enriches raw MatchmakingCandidate[] (internal scoring output) into SuggestedOpponentResponse[]
// (the shape consumed by the frontend).
//
// Responsibilities:
//   - Batch-fetch player profiles for all candidates (uses Redis cache)
//   - Batch-fetch win/loss counts for all candidates (two DB queries total)
//   - Compute distance (km) from requester to each candidate
//   - Compute levelDifference (candidate level − requester level)
//   - Format overlapRange into human-readable time slot strings
//   - Collapse reasons[] into a single reason string
//
// This lives in the controller layer (NOT in the service) so the service stays pure.
import { MatchmakingCandidate } from './matchmaking.types';
import { PlayersService } from '../players/players.service';
import { prisma } from '../../prisma';
import { PlayerDTO } from '../players/players.types';

// ─────────────────────────────────────────────────────────────
// Output type (mirrors frontend SuggestedOpponent)
// ─────────────────────────────────────────────────────────────

export interface SuggestedOpponentResponse {
  player: {
    id: string;
    userId: string;
    name: string;
    city: string;
    latitude: number;
    longitude: number;
    levelValue: number;
    levelConfidence: number;
    rating: number;
    matchesPlayed: number;
    wins: number;
    losses: number;
  };
  distance: number;
  levelDifference: number;
  availabilityOverlap: string[];
  reason: string;
  score: number;
  matchMode: 'availability' | 'profile';
  hasOpenAvailability: boolean;
}

// ─────────────────────────────────────────────────────────────
// Main enrichment function
// ─────────────────────────────────────────────────────────────

/**
 * Enriches a list of MatchmakingCandidates into SuggestedOpponentResponse objects
 * ready to be returned from the API.
 *
 * @param candidates  Raw scored candidates from the matchmaking service
 * @param requesterUserId  The user who requested suggestions (used for distance/level diff)
 */
export async function enrichCandidates(
  candidates: MatchmakingCandidate[],
  requesterUserId: string
): Promise<SuggestedOpponentResponse[]> {
  if (candidates.length === 0) return [];

  const candidateUserIds = candidates.map(c => c.candidateUserId);

  // Load requester and candidate player profiles (all cached)
  const [requesterPlayer, candidatePlayersArr] = await Promise.all([
    PlayersService.findPlayerByUserIdCached(requesterUserId).catch(() => null),
    PlayersService.findPlayersByUserIdsCached(candidateUserIds)
  ]);
  const candidatePlayers = new Map<string, PlayerDTO>(candidatePlayersArr.map(p => [p.userId, p]));

  // Batch stats: wins and total competitive confirmed matches per candidate user
  const statsMap = await batchFetchStats(candidateUserIds);

  const requesterLevel = requesterPlayer?.levelValue ?? null;
  const requesterLocation =
    requesterPlayer?.latitude != null && requesterPlayer?.longitude != null
      ? { lat: requesterPlayer.latitude, lng: requesterPlayer.longitude }
      : null;

  const results: SuggestedOpponentResponse[] = [];

  for (const candidate of candidates) {
    const player = candidatePlayers.get(candidate.candidateUserId);
    if (!player) continue;

    const stats = statsMap.get(candidate.candidateUserId) ?? { wins: 0, losses: 0, matchesPlayed: 0 };

    // Distance
    const candidateLocation =
      player.latitude != null && player.longitude != null
        ? { lat: player.latitude, lng: player.longitude }
        : null;
    const distance =
      requesterLocation && candidateLocation
        ? haversineDistanceKm(requesterLocation.lat, requesterLocation.lng, candidateLocation.lat, candidateLocation.lng)
        : 0;

    // Level difference (candidate − requester, signed)
    const candidateLevel = player.levelValue ?? 0;
    const levelDifference = requesterLevel != null ? candidateLevel - requesterLevel : 0;

    // Availability overlap time slot strings (only in availability mode)
    const availabilityOverlap = formatOverlapSlots(candidate);

    // Reason: join all reason strings
    const reason = candidate.reasons.filter(Boolean).join(' · ') || 'Potential match';

    results.push({
      player: {
        id: player.id,
        userId: player.userId,
        name: player.name,
        city: player.defaultCity ?? '',
        latitude: player.latitude ?? 0,
        longitude: player.longitude ?? 0,
        levelValue: candidateLevel,
        levelConfidence: player.levelConfidence ?? 0,
        rating: candidateLevel, // rating == levelValue (ELO)
        matchesPlayed: stats.matchesPlayed,
        wins: stats.wins,
        losses: stats.losses
      },
      distance: Math.round(distance * 10) / 10,
      levelDifference: Math.round(levelDifference),
      availabilityOverlap,
      reason,
      score: Math.round(candidate.score * 10) / 10,
      matchMode: candidate.matchMode,
      hasOpenAvailability: candidate.hasOpenAvailability
    });
  }

  return results;
}

// ─────────────────────────────────────────────────────────────
// Batch stats
// ─────────────────────────────────────────────────────────────

interface PlayerStats {
  wins: number;
  losses: number;
  matchesPlayed: number;
}

/**
 * Fetches win/loss/matchesPlayed for a list of user IDs in two queries:
 *   1. All competitive confirmed MatchParticipant rows (total matches)
 *   2. All Result rows where winnerUserId is in the list (wins)
 */
async function batchFetchStats(userIds: string[]): Promise<Map<string, PlayerStats>> {
  if (userIds.length === 0) return new Map();

  const [participations, winResults] = await Promise.all([
    prisma.matchParticipant.findMany({
      where: {
        userId: { in: userIds },
        match: {
          type: 'competitive',
          result: { status: 'confirmed' }
        }
      },
      select: { userId: true }
    }),
    prisma.result.findMany({
      where: {
        winnerUserId: { in: userIds },
        status: 'confirmed',
        match: { type: 'competitive' }
      },
      select: { winnerUserId: true }
    })
  ]);

  const totalMap = new Map<string, number>();
  for (const p of participations) {
    totalMap.set(p.userId, (totalMap.get(p.userId) ?? 0) + 1);
  }

  const winsMap = new Map<string, number>();
  for (const r of winResults) {
    if (r.winnerUserId) {
      winsMap.set(r.winnerUserId, (winsMap.get(r.winnerUserId) ?? 0) + 1);
    }
  }

  const statsMap = new Map<string, PlayerStats>();
  for (const userId of userIds) {
    const matchesPlayed = totalMap.get(userId) ?? 0;
    const wins = winsMap.get(userId) ?? 0;
    statsMap.set(userId, { matchesPlayed, wins, losses: matchesPlayed - wins });
  }

  return statsMap;
}

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

/**
 * Formats the overlapRange from an availability-mode candidate into a
 * human-readable time slot string array, e.g. ["Tue 7 Apr, 10:00–12:00"].
 * Returns [] for profile-mode candidates (no overlap data).
 */
function formatOverlapSlots(candidate: MatchmakingCandidate): string[] {
  if (candidate.matchMode !== 'availability' || !candidate.overlapRange) return [];

  const start = new Date(candidate.overlapRange.start);
  const end = new Date(candidate.overlapRange.end);

  const dateStr = start.toLocaleDateString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short'
  });
  const startTime = start.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  const endTime = end.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });

  return [`${dateStr}, ${startTime}–${endTime}`];
}

function haversineDistanceKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng / 2) * Math.sin(dLng / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
