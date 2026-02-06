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
  // Ensure every user gets a player (1:1 with availabilities)
  const playerUsers = users;
  const usedUserIds = new Set<string>();
  const players: PlayerSeed[] = [];
  // Use 3 fixed cities with real coordinates (e.g., Paris, Berlin, Madrid)
  const cityCenters: { [city: string]: { lat: number; lng: number } } = {
    Paris: { lat: 48.8566, lng: 2.3522 },
    Berlin: { lat: 52.52, lng: 13.405 },
    Madrid: { lat: 40.4168, lng: -3.7038 }
  };
  const cityList = Object.keys(cityCenters);

  // Helper to generate a random coordinate within 30-40km of a center point
  function randomNearbyCoordinate(centerLat: number, centerLng: number, minDistanceKm: number, maxDistanceKm: number) {
    const R = 6371; // Earth radius in km
    const distance = minDistanceKm + Math.random() * (maxDistanceKm - minDistanceKm);
    const angle = Math.random() * 2 * Math.PI;
    const dLat = (distance / R) * (180 / Math.PI);
    const dLng = (distance / R) * (180 / Math.PI) / Math.cos(centerLat * Math.PI / 180);
    return {
      latitude: centerLat + dLat * Math.cos(angle),
      longitude: centerLng + dLng * Math.sin(angle)
    };
  }
  for (const user of playerUsers) {
    if (usedUserIds.has(user.id)) continue;
    usedUserIds.add(user.id);
    // Assign a city from the 3 fixed cities
    const defaultCity = faker.helpers.arrayElement(cityList);
    const center = cityCenters[defaultCity];
    // Place player within 30-40km of city center
    const coord = randomNearbyCoordinate(center.lat, center.lng, 30, 40);
    // Ensure coordinates are always numbers
    if (
      typeof coord.latitude === 'number' &&
      typeof coord.longitude === 'number' &&
      !isNaN(coord.latitude) &&
      !isNaN(coord.longitude)
    ) {
      players.push({
        userId: user.id,
        displayName: user.name ?? undefined,
        levelValue: faker.number.float({ min: 1, max: 7, multipleOf: 0.1 }),
        levelConfidence: faker.number.float({ min: 0.5, max: 1, multipleOf: 0.01 }),
        defaultCity,
        latitude: coord.latitude,
        longitude: coord.longitude,
      });
    }
  }
  if (players.length === 0) {
    throw new Error('No players generated with valid coordinates.');
  }
  return batchInsert(players, 20, (player) =>
    prisma.player.create({ data: player })
  );
}
