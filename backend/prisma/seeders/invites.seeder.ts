import { faker } from '@faker-js/faker';
import { batchInsert } from './batchInsert.util';
import { PrismaClient, InviteStatus } from '@prisma/client';
import { DEV_USER_ID } from './users.seeder';

const prisma = new PrismaClient();

type InviteSeed = {
  token: string;
  inviterUserId: string;
  availabilityId: string;
  status: InviteStatus;
  expiresAt: Date;
  minLevel?: number;
  maxLevel?: number;
  radiusKm?: number;
  visibility: 'private' | 'community';
  matchType: 'competitive' | 'practice';
};

export async function seedInvites(users: { id: string }[], availabilities: { id: string; userId: string }[]) {
  if (!users.length || !availabilities.length) return [];
  const usedPairs = new Set<string>();
  const invites: InviteSeed[] = [];
  for (let i = 0; i < 400; i++) {
    let inviter, availability;
    let attempts = 0;
    do {
      inviter = faker.helpers.arrayElement(users);
      availability = faker.helpers.arrayElement(availabilities);
      if (++attempts > 1000) break;
    } while (
      inviter.id === availability.userId ||
      usedPairs.has(inviter.id + '-' + availability.id)
    );
    if (attempts > 1000) break;
    usedPairs.add(inviter.id + '-' + availability.id);
    // Generate minLevel and maxLevel (min <= max)
    const minLevel = faker.number.float({ min: 1, max: 4, multipleOf: 0.1 });
    const maxLevel = faker.number.float({ min: minLevel, max: 5, multipleOf: 0.1 });
    const status = faker.helpers.weightedArrayElement([
      { weight: 6, value: InviteStatus.accepted },
      { weight: 3, value: InviteStatus.pending },
      { weight: 1, value: InviteStatus.cancelled },
    ]);

    // Randomly assign matchType: 80% competitive, 20% practice
    const matchType = faker.datatype.boolean({ probability: 0.8 }) ? 'competitive' : 'practice';

    invites.push({
      token: faker.string.uuid(),
      inviterUserId: inviter.id,
      availabilityId: availability.id,
      status: status,
      expiresAt: faker.date.soon({ days: 10 }),
      minLevel,
      maxLevel,
      radiusKm: faker.number.float({ min: 1, max: 50, multipleOf: 0.1 }),
      visibility: faker.helpers.arrayElement(['private', 'community']),
      matchType,
    });
  }

  // Guarantee 10 pending community invites (for /invites/open), from users other than dev user
  const otherAvailabilities = availabilities.filter((a) => a.userId !== DEV_USER_ID);
  if (otherAvailabilities.length > 0) {
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);
    const usedAvailIds = new Set(invites.map((i) => i.availabilityId));
    for (let i = 0; i < 10; i++) {
      const availability = faker.helpers.arrayElement(
        otherAvailabilities.filter((a) => !usedAvailIds.has(a.id))
      );
      if (!availability) break;
      usedAvailIds.add(availability.id);
      invites.push({
        token: faker.string.uuid(),
        inviterUserId: availability.userId,
        availabilityId: availability.id,
        status: InviteStatus.pending,
        expiresAt,
        minLevel: 2,
        maxLevel: 6,
        radiusKm: 30,
        visibility: 'community',
        matchType: faker.datatype.boolean({ probability: 0.8 }) ? 'competitive' : 'practice',
      });
    }
  }

  return batchInsert(invites, 20, (invite) =>
    prisma.invite.create({ data: invite })
  );
}
