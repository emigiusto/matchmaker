import { faker } from '@faker-js/faker';
import { batchInsert } from './batchInsert.util';
import { PrismaClient, InviteStatus } from '@prisma/client';

const prisma = new PrismaClient();

type InviteSeed = {
  token: string;
  inviterUserId: string;
  availabilityId: string;
  status: InviteStatus;
  expiresAt: Date;
};

export async function seedInvites(users: { id: string }[], availabilities: { id: string; userId: string }[]) {
  const usedPairs = new Set<string>();
  const invites: InviteSeed[] = [];
  for (let i = 0; i < 400; i++) {
    let inviter, availability;
    do {
      inviter = faker.helpers.arrayElement(users);
      availability = faker.helpers.arrayElement(availabilities);
    } while (
      inviter.id === availability.userId ||
      usedPairs.has(inviter.id + '-' + availability.id)
    );
    usedPairs.add(inviter.id + '-' + availability.id);
    invites.push({
      token: faker.string.uuid(),
      inviterUserId: inviter.id,
      availabilityId: availability.id,
      status: InviteStatus.pending,
      expiresAt: faker.date.soon({ days: 10 }),
    });
  }
  return batchInsert(invites, 20, (invite) =>
    prisma.invite.create({ data: invite })
  );
}
