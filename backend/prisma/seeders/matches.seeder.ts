import { faker } from '@faker-js/faker';
import { batchInsert } from './batchInsert.util';
import { PrismaClient } from '@prisma/client';
import type { CompletedRequestSeed } from './schedulingRequests.seeder';

const prisma = new PrismaClient();

export async function seedMatches(
  completedRequests: CompletedRequestSeed[],
  players: { id: string; userId: string }[],
  venues: { id: string }[],
  allUsers: { id: string }[]
) {
  if (completedRequests.length === 0) {
    console.log('  matches: 0');
    return [];
  }

  const results: { id: string; participants: { userId: string; team: 'A' | 'B' }[]; scheduledAt: Date; type: 'competitive' | 'practice' }[] = [];

  for (const req of completedRequests) {
    // Pick opponent(s): exclude host and hostPartner
    const excludeIds = new Set([req.hostUserId, req.hostPartnerUserId].filter(Boolean) as string[]);
    const opponentPool = allUsers.filter((u) => !excludeIds.has(u.id));
    if (opponentPool.length === 0) continue;

    const isDoubles = req.format === 'doubles';
    const neededOpponents = isDoubles ? 2 : 1;
    if (opponentPool.length < neededOpponents) continue;

    const opponents = faker.helpers.arrayElements(opponentPool, neededOpponents);

    // Determine match status from date
    const isPast = req.date < new Date();
    const matchStatus = isPast ? 'completed' : 'scheduled';

    // Create Availability for the host
    const availability = await prisma.availability.create({
      data: {
        userId: req.hostUserId,
        date: req.date,
        startTime: req.startTime,
        endTime: new Date(req.startTime.getTime() + 90 * 60 * 1000),
        locationText: faker.location.streetAddress(),
        status: 'matched',
      },
    });

    // Build participants: team A = host [+ hostPartner], team B = opponents
    const participantData: { userId: string; team: 'A' | 'B' }[] = [
      { userId: req.hostUserId, team: 'A' },
      ...opponents.map((o) => ({ userId: o.id, team: 'B' as const })),
    ];
    if (isDoubles && req.hostPartnerUserId) {
      participantData.push({ userId: req.hostPartnerUserId, team: 'A' });
    }

    // Find player records (for playerAId / playerBId)
    const playerA = players.find((p) => p.userId === req.hostUserId);
    const playerB = players.find((p) => p.userId === opponents[0].id);

    const venue = venues.length > 0 ? faker.helpers.arrayElement(venues) : null;

    const match = await prisma.match.create({
      data: {
        availabilityId: availability.id,
        venueId: venue?.id ?? null,
        playerAId: playerA?.id ?? null,
        playerBId: playerB?.id ?? null,
        scheduledAt: req.startTime,
        status: matchStatus,
        type: req.matchType,
        participants: {
          create: participantData,
        },
      },
      include: { participants: { select: { userId: true, team: true } } },
    });

    // Link scheduling request → match
    await prisma.schedulingRequest.update({
      where: { id: req.id },
      data: { matchId: match.id },
    });

    results.push({
      id: match.id,
      participants: match.participants,
      scheduledAt: match.scheduledAt,
      type: match.type,
    });
  }

  console.log(`  matches: ${results.length}`);
  return results;
}
