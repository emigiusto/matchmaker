import { faker } from '@faker-js/faker';
import { batchInsert } from './batchInsert.util';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

type ResultSeed = {
  matchId: string;
  winnerPlayerId: string;
};

export async function seedResults(matches: { id: string; playerAId: string; playerBId: string }[], players: { id: string }[]) {
  const results: ResultSeed[] = [];
  for (const match of matches) {
    const winnerId = faker.helpers.arrayElement([match.playerAId, match.playerBId]);
    results.push({
      matchId: match.id,
      winnerPlayerId: winnerId,
    });
  }
  return batchInsert(results, 20, (result) =>
    prisma.result.create({ data: result })
  );
}
