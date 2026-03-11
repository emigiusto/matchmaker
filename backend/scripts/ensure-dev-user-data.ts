/**
 * Ensures the dev user (023eddcc-c568-4091-8d7b-354a1744c7d4) has scheduling requests.
 * Run: npm run ensure-dev-user-data
 *
 * Use when GET /scheduling?hostUserId=023eddcc... returns [] without running full seed.
 */

import * as dotenv from 'dotenv';
import path from 'path';
import bcrypt from 'bcryptjs';

const backendDir = path.resolve(__dirname, '..');
dotenv.config({ path: path.join(backendDir, '.env.local') });
import { ensureDatabaseUrl } from '../src/config/database-url';
ensureDatabaseUrl();

import { PrismaClient } from '@prisma/client';
import { randomBytes } from 'crypto';
import { DEV_USER_ID, DEV_USER_2_ID } from '../prisma/seeders/users.seeder';

const prisma = new PrismaClient();
const SALT_ROUNDS = 10;
const DEV_PASSWORD = process.env.DEV_USER_PASSWORD || 'dev123';

function generateInviteToken(): string {
  return randomBytes(32).toString('base64url');
}

async function ensureDevUsers() {
  const passwordHash = bcrypt.hashSync(DEV_PASSWORD, SALT_ROUNDS);
  for (const [id, data] of [
    [DEV_USER_ID, { name: 'Alex Rivera', phone: '+34 600 000 001', email: 'alex@example.com' }],
    [DEV_USER_2_ID, { name: 'Jordan Kim', phone: '+34 600 000 002', email: 'jordan@example.com' }],
  ] as const) {
    const existing = await prisma.user.findUnique({ where: { id } });
    if (!existing) {
      await prisma.user.create({
        data: { id, ...data, passwordHash, isGuest: false },
      });
      console.log(`Created dev user: ${data.name} (${id})`);
    } else {
      await prisma.user.update({
        where: { id },
        data: { passwordHash },
      });
      console.log(`Updated dev user ${data.name} with password for login`);
    }
  }
}

async function main() {
  await ensureDevUsers();

  const user = await prisma.user.findUnique({ where: { id: DEV_USER_ID } });
  if (!user) throw new Error('Primary dev user not found after ensure');

  const count = await prisma.schedulingRequest.count({
    where: { hostUserId: DEV_USER_ID },
  });

  if (count >= 2) {
    console.log(`Dev user already has ${count} scheduling requests.`);
    return;
  }

  const toCreate = 2 - count;
  console.log(`Creating ${toCreate} scheduling request(s) for dev user...`);

  const usedTokens = new Set<string>();
  const pickSportAndFormat = () => {
    const sport = Math.random() > 0.5 ? 'padel' : 'tennis';
    return sport === 'padel'
      ? { sportType: 'padel' as const, format: 'doubles' as const }
      : {
          sportType: 'tennis' as const,
          format: (Math.random() > 0.2 ? 'singles' : 'doubles') as const,
        };
  };

  for (let i = 0; i < toCreate; i++) {
    let token: string;
    do {
      token = generateInviteToken();
    } while (usedTokens.has(token));
    usedTokens.add(token);

    const date = new Date();
    date.setDate(date.getDate() + Math.floor(Math.random() * 14) + 1);
    const startTime = new Date(date);
    startTime.setHours(9 + Math.floor(Math.random() * 10), 0, 0, 0);
    const endTime = new Date(startTime.getTime() + 90 * 60 * 1000);
    const { sportType, format } = pickSportAndFormat();

    let hostPartnerUserId: string | null = null;
    if (format === 'doubles') {
      const partner = await prisma.user.findFirst({
        where: { id: { not: DEV_USER_ID }, phone: { not: null } },
      });
      if (partner) hostPartnerUserId = partner.id;
    }

    const request = await prisma.schedulingRequest.create({
      data: {
        hostUserId: DEV_USER_ID,
        hostPartnerUserId,
        sportType,
        format,
        matchType: 'competitive',
        date,
        startTime,
        endTime,
        locationText: 'Main Court',
        radiusKm: 20,
        responseWindowMinutes: 240,
        inviteToken: token,
        status: 'active',
      },
    });

    // Add candidates (previous statuses first: accepted, declined, expired; then ongoing)
    const excludeIds = [DEV_USER_ID, hostPartnerUserId].filter(Boolean) as string[];
    const otherUsers = await prisma.user.findMany({
      where: { id: { notIn: excludeIds }, phone: { not: null } },
      take: 5,
    });
    const statuses: Array<'accepted' | 'declined' | 'pending' | 'contacted'> = [
      'declined',
      'contacted',
      'pending',
      ...(otherUsers.length > 3 ? ['pending'] : []),
    ];
    for (let j = 0; j < Math.min(statuses.length, otherUsers.length); j++) {
      const status = statuses[j];
      const contact = otherUsers[j];
      await prisma.schedulingCandidate.create({
        data: {
          schedulingRequestId: request.id,
          contactUserId: contact.id,
          priorityOrder: j,
          status,
          contactedAt: ['contacted', 'accepted', 'declined'].includes(status)
            ? new Date(Date.now() - 3600000)
            : null,
          responseAt: ['accepted', 'declined'].includes(status)
            ? new Date(Date.now() - 3000000)
            : null,
        },
      });
    }
  }

  const finalCount = await prisma.schedulingRequest.count({
    where: { hostUserId: DEV_USER_ID },
  });
  console.log(`Done. Dev user now has ${finalCount} scheduling request(s).`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
