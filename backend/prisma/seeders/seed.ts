import * as dotenv from 'dotenv';
import path from 'path';
import process from 'process';

// Load .env from backend folder (ENV_FILE selects .env.local or .env.production)
const backendDir = path.resolve(__dirname, '../..');
const envFile = process.env.ENV_FILE || '.env';
dotenv.config({ path: path.join(backendDir, envFile) });

// Build DATABASE_URL from DB_* vars if needed (must run before any Prisma usage)
import { ensureDatabaseUrl } from '../../src/config/database-url';
ensureDatabaseUrl();

import prisma from '../../src/config/database';
import { seedUsers } from './users.seeder';
import { seedPlayers } from './players.seeder';
import { seedAvailabilities } from './availabilities.seeder';
import { seedVenues } from './venues.seeder';
import { seedGroups } from './groups.seeder';
import { seedGroupMembers } from './groupMembers.seeder';
import { seedGuestContacts } from './guestContacts.seeder';
import { seedFriendships } from './friendships.seeder';
import { seedInvites } from './invites.seeder';
import { seedMatches } from './matches.seeder';
import { seedSchedulingRequests } from './schedulingRequests.seeder';
import { seedSchedulingCandidates } from './schedulingCandidates.seeder';
import { seedResults } from './results.seeder';

async function main() {
  // Only allow seeding in DEVELOPMENT, or when SEED_ALLOW_PRODUCTION=true
  const allowProduction = process.env.SEED_ALLOW_PRODUCTION === 'true' || process.env.SEED_ALLOW_PRODUCTION === '1';
  if (process.env.ENVIRONMENT !== 'DEVELOPMENT' && !allowProduction) {
    console.error('Seeding is only allowed in DEVELOPMENT. Set SEED_ALLOW_PRODUCTION=true to seed production.');
    process.exit(1);
  }
  if (allowProduction) {
    console.log('[SEED] Running against production database (SEED_ALLOW_PRODUCTION=true)');
  }
  // Clean up all data (disable FK checks for MySQL to avoid order issues)
  await prisma.$executeRawUnsafe('SET FOREIGN_KEY_CHECKS = 0');
  await prisma.setResult.deleteMany();
  await prisma.notification.deleteMany();
  await prisma.message.deleteMany();
  await prisma.groupMember.deleteMany();
  await prisma.guestContact.deleteMany();
  await prisma.friendship.deleteMany();
  await prisma.ratingHistory.deleteMany();
  await prisma.schedulingCandidate.deleteMany();
  await prisma.schedulingRequest.deleteMany();
  await prisma.result.deleteMany();
  await prisma.conversation.deleteMany();
  await prisma.match.deleteMany();
  await prisma.invite.deleteMany();
  await prisma.availability.deleteMany();
  await prisma.playerSurface.deleteMany();
  await prisma.player.deleteMany();
  await prisma.venue.deleteMany();
  await prisma.group.deleteMany();
  await prisma.user.deleteMany();
  await prisma.$executeRawUnsafe('SET FOREIGN_KEY_CHECKS = 1');

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
  // 6. Group members
  const groupMembers = await seedGroupMembers(groups, users);
  // 7. Guest contacts (users' address book entries)
  const guestContacts = await seedGuestContacts(users);
  // 8. Friendships (user-user and user-guestContact)
  const friendships = await seedFriendships(users, guestContacts);
  // 9. Invites (for availabilities)
  const invites = await seedInvites(users, availabilities);
  // 10. Matches (for invites, availabilities, players, venues)
  const matchesRaw = await seedMatches(invites, availabilities, players, venues);
  // 11. Scheduling requests and candidates (WhatsApp scheduling flow)
  const schedulingRequests = await seedSchedulingRequests(users, users);
  const schedulingCandidates = await seedSchedulingCandidates(schedulingRequests, users);
  // Only pass matches with non-null hostUserId/opponentUserId to results seeder
  const matches = matchesRaw
    .filter((m: any) => m && m.hostUserId && m.opponentUserId && m.scheduledAt && m.type)
    .map((m: any) => ({
      id: m.id,
      hostUserId: m.hostUserId,
      opponentUserId: m.opponentUserId,
      scheduledAt: m.scheduledAt,
      type: m.type,
    })) as { id: string; hostUserId: string; opponentUserId: string; scheduledAt: Date; type: 'competitive' | 'practice' }[];
  // 12. Results (for matches)
  await seedResults(matches);

  console.log('Seeded:', {
    users: users.length,
    players: players.length,
    availabilities: availabilities.length,
    venues: venues.length,
    groups: groups.length,
    groupMembers: groupMembers.length,
    guestContacts: guestContacts.length,
    friendships: friendships.length,
    invites: invites.length,
    matches: matches.length,
    schedulingRequests: schedulingRequests.length,
    schedulingCandidates: schedulingCandidates.length,
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
