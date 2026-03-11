import { faker } from '@faker-js/faker';
import { batchInsert } from './batchInsert.util';
import { PrismaClient } from '@prisma/client';
import { DEV_USER_ID } from './users.seeder';

const prisma = new PrismaClient();

type GroupSeed = {
  name: string;
  ownerUserId: string;
};

const NAMED_GROUPS_FOR_DEV = [
  'Tennis usuals',
  'Padel crew',
  'Weekend players',
  'Court regulars',
];

export async function seedGroups(users: { id: string }[]) {
  if (!users.length) return [];
  const usedNames = new Set<string>(NAMED_GROUPS_FOR_DEV);
  const groups: GroupSeed[] = [];

  // Create named groups for dev user (e.g. Tennis usuals)
  const devUser = users.find((u) => u.id === DEV_USER_ID);
  if (devUser) {
    for (const name of NAMED_GROUPS_FOR_DEV) {
      groups.push({ name, ownerUserId: devUser.id });
    }
  }

  const groupCount = Math.min(40 - groups.length, users.length);
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
