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
  lastMatchAt?: Date | null;
};

const cityCenters: Record<
  string,
  { lat: number; lng: number }
> = {
  Paris: { lat: 48.8566, lng: 2.3522 },
  Berlin: { lat: 52.52, lng: 13.405 },
  Madrid: { lat: 40.4168, lng: -3.7038 },
};

const cityList = Object.keys(cityCenters);

/**
 * Generates a coordinate within X km radius from a center point.
 */
function randomNearbyCoordinate(
  centerLat: number,
  centerLng: number,
  radiusKm: number
) {
  const R = 6371; // Earth radius km

  const distance = Math.random() * radiusKm;
  const angle = Math.random() * 2 * Math.PI;

  const dLat = (distance / R) * (180 / Math.PI);
  const dLng =
    (distance / R) *
    (180 / Math.PI) /
    Math.cos(centerLat * (Math.PI / 180));

  return {
    latitude: centerLat + dLat * Math.cos(angle),
    longitude: centerLng + dLng * Math.sin(angle),
  };
}

/**
 * Generate realistic tennis level distribution.
 * Most players between 3.0 and 5.0.
 */
function generateLevel() {
  const bucket = faker.helpers.weightedArrayElement([
    { weight: 2, value: 'beginner' },
    { weight: 6, value: 'intermediate' },
    { weight: 2, value: 'advanced' },
  ]);

  if (bucket === 'beginner') {
    return faker.number.float({ min: 1.5, max: 2.9, multipleOf: 0.1 });
  }

  if (bucket === 'advanced') {
    return faker.number.float({ min: 5.1, max: 7.0, multipleOf: 0.1 });
  }

  return faker.number.float({ min: 3.0, max: 5.0, multipleOf: 0.1 });
}

export async function seedPlayers(
  users: { id: string; name: string | null }[]
) {
  if (!users.length) {
    throw new Error('No users provided to seedPlayers');
  }

  const players: PlayerSeed[] = [];

  for (const user of users) {
    const defaultCity = faker.helpers.arrayElement(cityList);
    const center = cityCenters[defaultCity];

    const { latitude, longitude } = randomNearbyCoordinate(
      center.lat,
      center.lng,
      40 // within 40km
    );

    const levelValue = generateLevel();

    // Confidence correlates loosely with recent activity
    const isActive = faker.datatype.boolean({ probability: 0.7 });

    players.push({
      userId: user.id,
      displayName: user.name ?? undefined,
      levelValue,
      levelConfidence: faker.number.float({
        min: isActive ? 0.7 : 0.4,
        max: 1,
        multipleOf: 0.01,
      }),
      defaultCity,
      latitude,
      longitude,
      lastMatchAt: isActive
        ? faker.date.recent({ days: 60 })
        : null,
    });
  }

  return batchInsert(players, 50, (player) =>
    prisma.player.create({ data: player })
  );
}
