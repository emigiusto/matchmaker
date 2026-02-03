import { faker } from '@faker-js/faker';
import { batchInsert } from './batchInsert.util';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

type PlayerSeed = {
  userId: string;
  displayName?: string;
  levelValue: number;
  levelConfidence: number;
  defaultCity: string;
};

export async function seedPlayers(users: { id: string; name: string | null }[]) {
  const playerUsers = faker.helpers.arrayElements(users, Math.floor(users.length * 0.95));
  const usedUserIds = new Set<string>();
  const players: PlayerSeed[] = [];
  for (const user of playerUsers) {
    if (usedUserIds.has(user.id)) continue;
    usedUserIds.add(user.id);
    players.push({
      userId: user.id,
      displayName: user.name ?? undefined,
      levelValue: faker.number.float({ min: 1, max: 7, multipleOf: 0.1 }),
      levelConfidence: faker.number.float({ min: 0.5, max: 1, multipleOf: 0.01 }),
      defaultCity: faker.location.city(),
    });
  }
  return batchInsert(players, 20, (player) =>
    prisma.player.create({ data: player })
  );
}
