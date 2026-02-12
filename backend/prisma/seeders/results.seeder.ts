import { faker } from '@faker-js/faker';
import { batchInsert } from './batchInsert.util';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

type ResultSeed = {
  matchId: string;
  winnerUserId: string;
};

export async function seedResults(
  matches: { id: string; hostUserId: string; opponentUserId: string }[]
) {
  const results: ResultSeed[] = [];
  for (const match of matches) {
    const { hostUserId, opponentUserId } = match;
    if (!hostUserId || !opponentUserId) continue;
    const winnerId = faker.helpers.arrayElement([hostUserId, opponentUserId]);
    results.push({
      matchId: match.id,
      winnerUserId: winnerId,
    });
  }
  return batchInsert(results, 20, (result) =>
    prisma.result.create({ data: result })
  );
}
