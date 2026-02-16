
// Seeder function imports
import { seedUsers } from './users.seeder';
import { seedPlayers } from './players.seeder';
import { seedAvailabilities } from './availabilities.seeder';
import { seedVenues } from './venues.seeder';
import { seedGroups } from './groups.seeder';
import { seedInvites } from './invites.seeder';
import { seedMatches } from './matches.seeder';
import { seedResults } from './results.seeder';


import * as dotenv from 'dotenv';
import { PrismaClient } from '@prisma/client';
import process from 'process';

dotenv.config({ path: '../../.env' });

const prisma = new PrismaClient();

async function main() {
    // Only allow seeding in DEVELOPMENT environment
    if (process.env.ENVIRONMENT !== 'DEVELOPMENT') {
      console.error('Seeding is only allowed in DEVELOPMENT environment. Aborting.');
      process.exit(1);
    }
  // Clean up all data (order matters for FKs)
  // 1. Delete leaf tables first (SetResult, Notification, Message, GroupMember, GuestContact, Friendship, etc.)
  await prisma.setResult.deleteMany();
  await prisma.notification.deleteMany();
  await prisma.message.deleteMany();
  await prisma.groupMember.deleteMany();
  await prisma.guestContact.deleteMany();
  await prisma.friendship.deleteMany();
  // 2. Delete mid-level tables (Result, Match, Invite, Availability, Player, Venue, Group)
  await prisma.result.deleteMany();
  await prisma.match.deleteMany();
  await prisma.invite.deleteMany();
  await prisma.availability.deleteMany();
  await prisma.player.deleteMany();
  await prisma.venue.deleteMany();
  await prisma.group.deleteMany();
  // 3. Delete users last
  await prisma.user.deleteMany();

  // 1. Users
  const users = await seedUsers();
  // 2. Players (for a subset of users)
  const playersRaw = await seedPlayers(users);
  const players = playersRaw.filter(Boolean) as { id: string; userId: string }[];
  // 3. Availabilities (for users/players)
  const availabilities = await seedAvailabilities(users);
  // 4. Venues
  const venues = await seedVenues();
  // 5. Groups
  const groups = await seedGroups(users);
  // 6. Invites (for availabilities)
  const invites = await seedInvites(users, availabilities);
  // 7. Matches (for invites, availabilities, players, venues)
  const matchesRaw = await seedMatches(invites, availabilities, players, venues);
  // Only pass matches with non-null hostUserId/opponentUserId to results seeder
  const matches = matchesRaw
    .filter((m: any) => m && m.hostUserId && m.opponentUserId && m.scheduledAt)
    .map((m: any) => ({
      id: m.id,
      hostUserId: m.hostUserId,
      opponentUserId: m.opponentUserId,
      scheduledAt: m.scheduledAt,
    })) as { id: string; hostUserId: string; opponentUserId: string; scheduledAt: Date }[];
  // 8. Results (for matches)
  await seedResults(matches);

  console.log('Seeded:', {
    users: users.length,
    players: players.length,
    availabilities: availabilities.length,
    venues: venues.length,
    groups: groups.length,
    invites: invites.length,
    matches: matches.length,
    results: matches.length, 
  });
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
