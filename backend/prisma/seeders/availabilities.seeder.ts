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
};

export async function seedAvailabilities(users: { id: string }[]) {
  const availabilities: AvailabilitySeed[] = [];
  for (const user of users) {
    const count = faker.number.int({ min: 4, max: 10 });
    const usedDates = new Set<string>();
    for (let i = 0; i < count; i++) {
      let date: Date;
      let dateKey: string;
      do {
        date = faker.date.soon({ days: 14 });
        dateKey = date.toISOString().split('T')[0];
      } while (usedDates.has(dateKey));
      usedDates.add(dateKey);
      availabilities.push({
        userId: user.id,
        date: date,
        startTime: faker.date.between({ from: date, to: new Date(date.getTime() + 2 * 60 * 60 * 1000) }),
        endTime: faker.date.between({ from: new Date(date.getTime() + 2 * 60 * 60 * 1000), to: new Date(date.getTime() + 4 * 60 * 60 * 1000) }),
        locationText: faker.location.streetAddress(),
        minLevel: faker.number.float({ min: 1, max: 5, fractionDigits: 1 }),
        maxLevel: faker.number.float({ min: 5, max: 7, fractionDigits: 1 }),
      });
    }
  }
  return batchInsert(availabilities, 20, (availability) =>
    prisma.availability.create({ data: availability })
  );
}
