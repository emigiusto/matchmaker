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
import { seedContacts } from './contacts.seeder';
import { seedContactLists } from './contactLists.seeder';
import { seedContactListMembers } from './contactListMembers.seeder';
import { seedMatches } from './matches.seeder';
import { seedSchedulingRequests } from './schedulingRequests.seeder';
import { seedSchedulingCandidates } from './schedulingCandidates.seeder';
import { seedResults } from './results.seeder';

async function main() {
  // Local: ENVIRONMENT=DEVELOPMENT. Production: SEED_ALLOW_PRODUCTION=true must be in .env.production
  const allowProduction = process.env.SEED_ALLOW_PRODUCTION === 'true' || process.env.SEED_ALLOW_PRODUCTION === '1';
  if (process.env.ENVIRONMENT !== 'DEVELOPMENT' && !allowProduction) {
    console.error(
      'Seeding is only allowed in DEVELOPMENT (npm run seed) or production when SEED_ALLOW_PRODUCTION=true is set in your .env.production file (npm run seed:prod).'
    );
    process.exit(1);
  }
  if (allowProduction) {
    console.log('[SEED] Production mode (SEED_ALLOW_PRODUCTION in .env.production)');
  }
  // Clean up all data — disable FK checks to avoid ordering issues (MySQL)
  await prisma.$executeRawUnsafe('SET FOREIGN_KEY_CHECKS = 0');
  try {
  await prisma.setResult.deleteMany();
  await prisma.result.deleteMany();
  await prisma.message.deleteMany();
  await prisma.notification.deleteMany();
  await prisma.contactListMember.deleteMany();
  await prisma.contactList.deleteMany();
  await prisma.contact.deleteMany();
  await prisma.schedulingCandidate.deleteMany();
  await prisma.schedulingRequest.deleteMany();
  await prisma.ratingHistory.deleteMany(); // refs Player, Match — before match
  await prisma.matchParticipant.deleteMany();
  await prisma.conversation.deleteMany();
  await prisma.match.deleteMany();
  await prisma.availability.deleteMany();
  await prisma.playerSurface.deleteMany();
  await prisma.player.deleteMany();
  await prisma.venue.deleteMany();
  await prisma.user.deleteMany();
  } finally {
    await prisma.$executeRawUnsafe('SET FOREIGN_KEY_CHECKS = 1');
  }

  // 1. Users
  const users = await seedUsers();
  // 2. Players (for a subset of users)
  const playersRaw = await seedPlayers(users);
  const players = playersRaw.filter(Boolean) as { id: string; userId: string }[];
  // 3. Availabilities (for users/players)
  const availabilities = await seedAvailabilities(users);
  // 4. Venues
  const venues = await seedVenues();
  // 5. Contacts (unified address book: unlinked + linked to registered users)
  const contacts = await seedContacts(users);
  // 6. Contact lists (named groups of contacts)
  const contactLists = await seedContactLists(users);
  // 7. Contact list members
  const contactListMembers = await seedContactListMembers(contactLists, contacts);
  // 8. Scheduling requests (past and future, all statuses)
  const { requests: schedulingRequests, completedRequests } = await seedSchedulingRequests(users, users);
  // 9. Scheduling candidates
  const schedulingCandidates = await seedSchedulingCandidates(schedulingRequests, users);
  // 10. Matches (from completed scheduling requests)
  const matchesRaw = await seedMatches(completedRequests, players, venues, users);
  // Pass matches with team A/B representatives for results seeder (from participants)
  const matches = matchesRaw
    .filter((m: any) => m && m.participants?.length >= 2 && m.scheduledAt && m.type)
    .map((m: any) => {
      const partA = m.participants?.find((p: { team: string }) => p.team === 'A');
      const partB = m.participants?.find((p: { team: string }) => p.team === 'B');
      if (!partA || !partB) return null;
      return {
        id: m.id,
        teamAUserId: partA.userId,
        teamBUserId: partB.userId,
        scheduledAt: m.scheduledAt,
        type: m.type,
      };
    })
    .filter(Boolean) as { id: string; teamAUserId: string; teamBUserId: string; scheduledAt: Date; type: 'competitive' | 'practice' }[];
  // 12. Results (for matches)
  await seedResults(matches);

  console.log('Seeded:', {
    users: users.length,
    players: players.length,
    availabilities: availabilities.length,
    venues: venues.length,
    contacts: contacts.length,
    contactLists: contactLists.length,
    contactListMembers: contactListMembers.length,
    schedulingRequests: schedulingRequests.length,
    schedulingCandidates: schedulingCandidates.length,
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
