import { faker } from '@faker-js/faker';
import { batchInsert } from './batchInsert.util';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

type GroupMemberSeed = {
  groupId: string;
  userId: string;
};

export async function seedGroupMembers(
  groups: { id: string; ownerUserId: string }[],
  users: { id: string }[]
) {
  const usedPairs = new Set<string>();
  const members: GroupMemberSeed[] = [];

  for (const group of groups) {
    const memberCount = faker.number.int({ min: 2, max: 12 });
    const pool = users.filter((u) => u.id !== group.ownerUserId);
    const chosen = faker.helpers.arrayElements(pool, Math.min(memberCount, pool.length));

    for (const user of chosen) {
      const key = `${group.id}-${user.id}`;
      if (usedPairs.has(key)) continue;
      usedPairs.add(key);
      members.push({ groupId: group.id, userId: user.id });
    }
    // Always add owner as a member
    const ownerKey = `${group.id}-${group.ownerUserId}`;
    if (!usedPairs.has(ownerKey)) {
      usedPairs.add(ownerKey);
      members.push({ groupId: group.id, userId: group.ownerUserId });
    }
  }

  if (members.length === 0) return [];
  return batchInsert(members, 30, (m) =>
    prisma.groupMember.create({ data: m })
  );
}
