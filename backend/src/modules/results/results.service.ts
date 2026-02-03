// results.service.ts
// Core logic for results. No ranking, statistics, or player level updates.
//
// Result is separated from Match to allow flexible, descriptive recording of outcomes.
// Rules are intentionally minimal and explicit: only one Result per Match, and set numbers must be unique per Result.
// No competitive meaning, ranking, or statistics logic yet. Naming and error handling are consistent with Matches module.

import { prisma } from '../../prisma';
import { ResultDTO, SetResultDTO, AddSetResultInput } from './results.types';
import { AppError } from '../../shared/errors/AppError'; // Consistent error handling


/**
 * Create a Result for a Match. Fails if one already exists.
 * No ranking or player stats logic. Naming and error handling are consistent with Matches module.
 */
export async function createResult(matchId: string, winnerPlayerId?: string | null): Promise<ResultDTO> {
  // Defensive: Only one Result per Match
  const existing = await prisma.result.findUnique({ where: { matchId } });
  if (existing) throw new AppError('Result already exists for this match', 409);

  // Defensive: Match must exist
  const match = await prisma.match.findUnique({ where: { id: matchId } });
  if (!match) throw new AppError('Cannot create result: Match does not exist', 404);

  // Create Result (guaranteed to have a valid Match)
  const result = await prisma.result.create({
    data: {
      matchId,
      winnerPlayerId: winnerPlayerId ?? null,
    },
    include: { sets: true },
  });
  return toResultDTO(result);
}

/**
 * Add a SetResult to a Result. Fails if Result does not exist or setNumber is not unique.
 * No ranking or player stats logic. Naming and error handling are consistent with Matches module.
 */
export async function addSetResult(resultId: string, setData: AddSetResultInput): Promise<SetResultDTO> {
  // Defensive: Result must exist and must belong to an existing Match
  const result = await prisma.result.findUnique({ where: { id: resultId }, include: { sets: true, match: true } });
  if (!result) throw new AppError('Result not found', 404);
  if (!result.match) throw new AppError('Invariant violation: Result does not belong to a valid Match', 500);
  // setNumber must be unique per Result
  if (result.sets.some(s => s.setNumber === setData.setNumber)) {
    throw new AppError('Set number already exists for this result', 409);
  }
  // Create SetResult (guaranteed to have a valid Result)
  const set = await prisma.setResult.create({
    data: {
      resultId,
      setNumber: setData.setNumber,
      playerAScore: setData.playerAScore,
      playerBScore: setData.playerBScore,
      tiebreakScoreA: setData.tiebreakScoreA ?? null,
      tiebreakScoreB: setData.tiebreakScoreB ?? null,
    },
  });
  return toSetResultDTO(set);
}

/**
 * Get the Result for a Match (by matchId)
 * No ranking or player stats logic. Naming and error handling are consistent with Matches module.
 */
export async function getResultByMatch(matchId: string): Promise<ResultDTO> {
  // Defensive: Result must exist and must belong to an existing Match
  const result = await prisma.result.findUnique({
    where: { matchId },
    include: { sets: true, match: true },
  });
  if (!result) throw new AppError('Result not found for this match', 404);
  if (!result.match) throw new AppError('Invariant violation: Result does not belong to a valid Match', 500);
  return toResultDTO(result);
}

/**
 * Get all results for a player (by playerId)
 */
export async function getResultsByPlayer(playerId: string): Promise<ResultDTO[]> {
  // Find all results where the match has playerAId or playerBId = playerId
  const matches = await prisma.match.findMany({
    where: {
      OR: [
        { playerAId: playerId },
        { playerBId: playerId },
      ],
    },
    select: { id: true },
  });
  const matchIds = matches.map(m => m.id);
  if (matchIds.length === 0) return [];
  const results = await prisma.result.findMany({
    where: { matchId: { in: matchIds } },
    include: { sets: true },
    orderBy: { createdAt: 'desc' },
  });
  return results.map(toResultDTO);
}

/**
 * Get all results for a user (by userId)
 */
export async function getResultsByUser(userId: string): Promise<ResultDTO[]> {
  // Find all matches where user is inviter, owns availability, or is a player
  const player = await prisma.player.findUnique({ where: { userId } });
  const orConditions: any[] = [
    { invite: { inviterId: userId } },
    { availability: { userId } },
  ];
  if (player) {
    orConditions.push({ playerAId: player.id });
    orConditions.push({ playerBId: player.id });
  }
  const matches = await prisma.match.findMany({
    where: { OR: orConditions },
    select: { id: true },
  });
  const matchIds = matches.map(m => m.id);
  if (matchIds.length === 0) return [];
  const results = await prisma.result.findMany({
    where: { matchId: { in: matchIds } },
    include: { sets: true },
    orderBy: { createdAt: 'desc' },
  });
  return results.map(toResultDTO);
}

/**
 * Get the most recent results (optionally limited)
 */
export async function getRecentResults(limit: number = 10): Promise<ResultDTO[]> {
  const results = await prisma.result.findMany({
    include: { sets: true },
    orderBy: { createdAt: 'desc' },
    take: limit,
  });
  return results.map(toResultDTO);
}

function toResultDTO(result: ResultDB): ResultDTO {
  return {
    id: result.id,
    matchId: result.matchId,
    winnerPlayerId: result.winnerPlayerId,
    createdAt: result.createdAt.toISOString(),
    sets: (result.sets || [])
      .slice()
      .sort((a, b) => a.setNumber - b.setNumber)
      .map(toSetResultDTO),
  };
}

function toSetResultDTO(set: SetResultDB): SetResultDTO {
  return {
    id: set.id,
    setNumber: set.setNumber,
    playerAScore: set.playerAScore,
    playerBScore: set.playerBScore,
    tiebreakScoreA: set.tiebreakScoreA,
    tiebreakScoreB: set.tiebreakScoreB,
  };
}


// --- Helpers ---
// Defensive: sets are always returned ordered by setNumber. No ranking/statistics logic.
type SetResultDB = {
  id: string;
  setNumber: number;
  playerAScore: number;
  playerBScore: number;
  tiebreakScoreA: number | null;
  tiebreakScoreB: number | null;
};

type ResultDB = {
  id: string;
  matchId: string;
  winnerPlayerId: string | null;
  createdAt: Date;
  sets?: SetResultDB[];
};