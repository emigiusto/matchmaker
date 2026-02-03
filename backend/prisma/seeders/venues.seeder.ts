import { faker } from '@faker-js/faker';
import { batchInsert } from './batchInsert.util';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

type VenueSeed = {
  name: string;
  city: string;
  address: string;
  indoor: boolean;
  surface: string;
};

export async function seedVenues() {
  const usedNames = new Set<string>();
  const venues: VenueSeed[] = [];
  for (let i = 0; i < 50; i++) {
    let name: string;
    do {
      name = faker.company.name();
    } while (usedNames.has(name));
    usedNames.add(name);
    venues.push({
      name,
      city: faker.location.city(),
      address: faker.location.streetAddress(),
      indoor: faker.datatype.boolean(),
      surface: faker.helpers.arrayElement(['clay', 'hard', 'grass', 'carpet']),
    });
  }
  return batchInsert(venues, 20, (venue) =>
    prisma.venue.create({ data: venue })
  );
}
