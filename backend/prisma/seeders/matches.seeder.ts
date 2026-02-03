import { faker } from '@faker-js/faker';
import { batchInsert } from './batchInsert.util';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

type MatchSeed = {
  inviteId: string;
  availabilityId: string;
  venueId: string;
  playerAId: string;
  playerBId: string;
  scheduledAt: Date;
};

export async function seedMatches(invites: { id: string; availabilityId: string }[], availabilities: { id: string; userId: string }[], players: { id: string; userId: string }[], venues: { id: string }[]) {
  const matches: MatchSeed[] = [];
  for (const invite of invites) {
    const availability = availabilities.find((a) => a.id === invite.availabilityId);
    if (!availability) continue;
    const ownerPlayer = players.find((p) => p.userId === availability.userId);
    const inviterPlayer = players.find((p) => p.userId === (invite as any).inviterUserId);
    if (!ownerPlayer || !inviterPlayer || ownerPlayer.id === inviterPlayer.id) continue;
    const venue = faker.helpers.arrayElement(venues);
    matches.push({
      inviteId: invite.id,
      availabilityId: availability.id,
      venueId: venue.id,
      playerAId: ownerPlayer.id,
      playerBId: inviterPlayer.id,
      scheduledAt: faker.date.soon({ days: 10 }),
    });
  }
  return batchInsert(matches, 20, (match) =>
    prisma.match.create({ data: match })
  );
}
