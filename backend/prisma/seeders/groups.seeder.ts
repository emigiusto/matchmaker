import { faker } from '@faker-js/faker';
import { batchInsert } from './batchInsert.util';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

type GroupSeed = {
  name: string;
  ownerUserId: string;
};

export async function seedGroups(users: { id: string }[]) {
  if (!users.length) return [];
  const usedNames = new Set<string>();
  const groups: GroupSeed[] = [];
  const groupCount = Math.min(40, users.length);
  for (let i = 0; i < groupCount; i++) {
    let name: string;
    do {
      name = faker.company.name();
    } while (usedNames.has(name));
    usedNames.add(name);
    const owner = users[i];
    groups.push({ name, ownerUserId: owner.id });
  }
  if (groups.length === 0) return [];
  return batchInsert(groups, 20, (group) =>
    prisma.group.create({ data: group })
  );
}
