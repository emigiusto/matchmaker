import { faker } from '@faker-js/faker';
import { batchInsert } from './batchInsert.util';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

type GroupSeed = {
  name: string;
  ownerUserId: string;
};

export async function seedGroups(users: { id: string }[]) {
  const usedNames = new Set<string>();
  const usedOwners = new Set<string>();
  const groups: GroupSeed[] = [];
  for (let i = 0; i < 40; i++) {
    let name: string;
    do {
      name = faker.company.name();
    } while (usedNames.has(name));
    usedNames.add(name);
    let owner;
    do {
      owner = faker.helpers.arrayElement(users);
    } while (usedOwners.has(owner.id));
    usedOwners.add(owner.id);
    groups.push({ name, ownerUserId: owner.id });
  }
  return batchInsert(groups, 20, (group) =>
    prisma.group.create({ data: group })
  );
}
