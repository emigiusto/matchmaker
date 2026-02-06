import { faker } from '@faker-js/faker';
import { batchInsert } from './batchInsert.util';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

type AvailabilitySeed = {
  userId: string;
  date: Date;
  startTime: Date;
  endTime: Date;
  locationText: string;
  minLevel: number;
  maxLevel: number;
  preferredSurface?: string | null;
  status?: 'open' | 'invited' | 'matched' | 'closed';
};

export async function seedAvailabilities(users: { id: string }[]) {
  const availabilities: AvailabilitySeed[] = [];
  // 1. Pick a few shared dates for overlap
  const sharedDates: Date[] = [];
  const today = new Date();
  for (let i = 0; i < 5; i++) {
    const d = new Date(today.getTime() + i * 24 * 60 * 60 * 1000);
    d.setHours(0, 0, 0, 0);
    sharedDates.push(d);
  }

  // 2. For each shared date, pick a random time window and assign to a group of users
  for (const date of sharedDates) {
    // Pick a random start hour between 8am and 16pm
    const startHour = faker.number.int({ min: 8, max: 16 });
    const startTime = new Date(date.getTime());
    startTime.setHours(startHour, 0, 0, 0);
    const endTime = new Date(startTime.getTime() + 90 * 60 * 1000); // 1.5h slot
    // Pick 8-15 users to have overlapping slots on this date
    const overlapUsers = faker.helpers.arrayElements(users, faker.number.int({ min: 8, max: 15 }));
    for (const user of overlapUsers) {
      availabilities.push({
        userId: user.id,
        date: date,
        startTime: new Date(startTime),
        endTime: new Date(endTime),
        locationText: faker.location.streetAddress(),
        minLevel: faker.number.float({ min: 1, max: 5, fractionDigits: 1 }),
        maxLevel: faker.number.float({ min: 5, max: 7, fractionDigits: 1 }),
        preferredSurface: faker.helpers.arrayElement(['clay', 'grass', 'hard', null]),
        status: 'open',
      });
    }
  }

  // 3. Add some unique/random availabilities for realism
  for (const user of users) {
    const count = faker.number.int({ min: 2, max: 5 });
    const usedDates = new Set<string>();
    for (let i = 0; i < count; i++) {
      let date: Date;
      let dateKey: string;
      do {
        date = faker.date.soon({ days: 14 });
        dateKey = date.toISOString().split('T')[0];
      } while (usedDates.has(dateKey) || sharedDates.some(d => d.toISOString().split('T')[0] === dateKey));
      usedDates.add(dateKey);
      const slotStart = faker.date.between({ from: date, to: new Date(date.getTime() + 2 * 60 * 60 * 1000) });
      const slotEnd = faker.date.between({ from: new Date(date.getTime() + 2 * 60 * 60 * 1000), to: new Date(date.getTime() + 4 * 60 * 60 * 1000) });
      availabilities.push({
        userId: user.id,
        date: date,
        startTime: slotStart,
        endTime: slotEnd,
        locationText: faker.location.streetAddress(),
        minLevel: faker.number.float({ min: 1, max: 5, fractionDigits: 1 }),
        maxLevel: faker.number.float({ min: 5, max: 7, fractionDigits: 1 }),
        preferredSurface: faker.helpers.arrayElement(['clay', 'grass', 'hard', null]),
        status: 'open',
      });
    }
  }

  return batchInsert(availabilities, 20, (availability) =>
    prisma.availability.create({ data: availability })
  );
}
