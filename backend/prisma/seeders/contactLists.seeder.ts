import { faker } from '@faker-js/faker';
import { batchInsert } from './batchInsert.util';
import { PrismaClient } from '@prisma/client';
import { DEV_USER_ID } from './users.seeder';

const prisma = new PrismaClient();

type ContactListSeed = {
  name: string;
  ownerUserId: string;
};

const NAMED_LISTS_FOR_DEV = [
  'Tennis usuals',
  'Padel crew',
  'Weekend players',
  'Court regulars',
];

export async function seedContactLists(users: { id: string }[]) {
  if (!users.length) return [];
  const usedNames = new Set<string>(NAMED_LISTS_FOR_DEV);
  const lists: ContactListSeed[] = [];

  const devUser = users.find((u) => u.id === DEV_USER_ID);
  if (devUser) {
    for (const name of NAMED_LISTS_FOR_DEV) {
      lists.push({ name, ownerUserId: devUser.id });
    }
  }

  const listCount = Math.min(40 - lists.length, users.length);
  for (let i = 0; i < listCount; i++) {
    let name: string;
    do {
      name = faker.company.name();
    } while (usedNames.has(name));
    usedNames.add(name);
    lists.push({ name, ownerUserId: users[i].id });
  }

  if (lists.length === 0) return [];
  return batchInsert(lists, 20, (list) =>
    prisma.contactList.create({ data: list })
  );
}
