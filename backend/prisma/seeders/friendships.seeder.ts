import { faker } from '@faker-js/faker';
import { batchInsert } from './batchInsert.util';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

type FriendshipSeed = {
  userId: string;
  friendUserId?: string;
  guestContactId?: string;
};

export async function seedFriendships(
  users: { id: string }[],
  guestContacts: { id: string; ownerUserId: string }[]
) {
  const usedPairs = new Set<string>();
  const friendships: FriendshipSeed[] = [];

  // User-to-user friendships
  for (let i = 0; i < 150; i++) {
    const [userA, userB] = faker.helpers.arrayElements(users, 2);
    if (userA.id === userB.id) continue;
    const key1 = `${userA.id}-${userB.id}`;
    const key2 = `${userB.id}-${userA.id}`;
    if (usedPairs.has(key1) || usedPairs.has(key2)) continue;
    usedPairs.add(key1);
    friendships.push({ userId: userA.id, friendUserId: userB.id });
  }

  // User-to-guestContact friendships (user adds their guest contact as friend)
  for (const gc of guestContacts) {
    if (faker.datatype.boolean({ probability: 0.6 })) {
      const key = `${gc.ownerUserId}-gc-${gc.id}`;
      if (usedPairs.has(key)) continue;
      usedPairs.add(key);
      friendships.push({ userId: gc.ownerUserId, guestContactId: gc.id });
    }
  }

  if (friendships.length === 0) return [];
  return batchInsert(friendships, 30, (f) =>
    prisma.friendship.create({
      data: {
        userId: f.userId,
        friendUserId: f.friendUserId ?? null,
        guestContactId: f.guestContactId ?? null,
      },
    })
  );
}
