
import { faker } from '@faker-js/faker';
import { batchInsert } from './batchInsert.util';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export async function seedMatches(
  invites: { id: string; availabilityId: string; inviterUserId: string; status: string }[],
  availabilities: { id: string; userId: string }[],
  players: { id: string; userId: string }[],
  venues: { id: string }[]
) {
  const matches = [];
  for (const invite of invites) {
    // 1. Only accepted invites
    if (invite.status !== 'accepted') continue;
    // 2. Find availability and ensure host/opponent logic
    const availability = availabilities.find((a) => a.id === invite.availabilityId);
    if (!availability) continue;
    const hostUserId = availability.userId;
    const opponentUserId = invite.inviterUserId;
    if (!hostUserId || !opponentUserId) continue;
    // 2. Find playerA/playerB
    const playerA = players.find((p) => p.userId === hostUserId);
    const playerB = players.find((p) => p.userId === opponentUserId);
    if (!playerA || !playerB || playerA.id === playerB.id) continue;
    // 3. Venue
    const venue = faker.helpers.arrayElement(venues);
    // 4. scheduledAt: 60% past, 40% future
    const isPast = faker.datatype.boolean({ probability: 0.6 });
    const scheduledAt = isPast
      ? faker.date.recent({ days: 30 })
      : faker.date.soon({ days: 10 });
    // 5. Always status: 'scheduled'
    matches.push({
      inviteId: invite.id,
      availabilityId: availability.id,
      venueId: venue.id,
      playerAId: playerA.id,
      playerBId: playerB.id,
      scheduledAt,
      hostUserId,
      opponentUserId,
      status: 'scheduled',
    });
  }

  return batchInsert(matches, 20, (match) =>
    prisma.match.create({
      data: {
        inviteId: match.inviteId,
        availabilityId: match.availabilityId,
        venueId: match.venueId,
        playerAId: match.playerAId,
        playerBId: match.playerBId,
        scheduledAt: match.scheduledAt,
        hostUserId: match.hostUserId,
        opponentUserId: match.opponentUserId,
        status: 'scheduled',
      }
    })
  );
}
