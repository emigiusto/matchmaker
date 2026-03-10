/**
 * Debug: verify scheduling data for dev user
 * Run: npx tsx scripts/debug-scheduling.ts
 */

import * as dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(__dirname, '../.env.local') });
import { ensureDatabaseUrl } from '../src/config/database-url';
ensureDatabaseUrl();

import prisma from '../src/config/database';

const DEV_USER_ID = '023eddcc-c568-4091-8d7b-354a1744c7d4';

async function main() {
  console.log('DATABASE_URL:', process.env.DATABASE_URL?.replace(/:[^:@]+@/, ':****@'));
  console.log('');

  const user = await prisma.user.findUnique({ where: { id: DEV_USER_ID } });
  console.log('Dev user exists:', !!user, user ? `(${user.name})` : '');

  const count = await prisma.schedulingRequest.count({
    where: { hostUserId: DEV_USER_ID },
  });
  console.log('Scheduling requests for dev user:', count);

  const requests = await prisma.schedulingRequest.findMany({
    where: { hostUserId: DEV_USER_ID },
    include: {
      candidates: { orderBy: { priorityOrder: 'asc' }, include: { contactUser: true } },
    },
  });
  console.log('Fetched requests:', requests.length);
  requests.forEach((r, i) => {
    console.log(`  ${i + 1}. ${r.id} status=${r.status} candidates=${r.candidates.length}`);
  });
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
