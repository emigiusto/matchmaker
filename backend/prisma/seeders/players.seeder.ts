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
  latitude: number;
  longitude: number;
};

export async function seedPlayers(users: { id: string; name: string | null }[]) {
  const playerUsers = faker.helpers.arrayElements(users, Math.floor(users.length * 0.95));
  const usedUserIds = new Set<string>();
  const players: PlayerSeed[] = [];
  // Generate a set of cities with fixed lat/lng for clustering
  const cityCenters: { [city: string]: { lat: number; lng: number } } = {};
  for (let i = 0; i < 10; i++) {
    const city = faker.location.city();
    cityCenters[city] = {
      lat: faker.location.latitude({ min: 40, max: 50 }),
      lng: faker.location.longitude({ min: -80, max: -70 })
    };
  }
  const cityList = Object.keys(cityCenters);
  for (const user of playerUsers) {
    if (usedUserIds.has(user.id)) continue;
    usedUserIds.add(user.id);
    // Assign a city from the cluster list
    const defaultCity = faker.helpers.arrayElement(cityList);
    const center = cityCenters[defaultCity];
    // Add small random offset to cluster around city center
    const latitude = center.lat + faker.number.float({ min: -0.05, max: 0.05, fractionDigits: 5 });
    const longitude = center.lng + faker.number.float({ min: -0.05, max: 0.05, fractionDigits: 5 });
    players.push({
      userId: user.id,
      displayName: user.name ?? undefined,
      levelValue: faker.number.float({ min: 1, max: 7, multipleOf: 0.1 }),
      levelConfidence: faker.number.float({ min: 0.5, max: 1, multipleOf: 0.01 }),
      defaultCity,
      latitude,
      longitude,
    });
  }
  return batchInsert(players, 20, (player) =>
    prisma.player.create({ data: player })
  );
}
