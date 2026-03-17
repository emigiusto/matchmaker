/// <reference types="node" />
import { randomBytes } from 'crypto';
import { faker } from '@faker-js/faker';
import { batchInsert } from './batchInsert.util';
import { PrismaClient } from '@prisma/client';
import type { Prisma } from '@prisma/client';
import { DEV_USER_ID, DEV_USER_2_ID } from './users.seeder';

const prisma = new PrismaClient();

function generateInviteToken(): string {
  return randomBytes(32).toString('base64url');
}

function makeTime(base: Date, hourOffset = 0): { date: Date; startTime: Date; endTime: Date } {
  const date = new Date(base);
  date.setHours(0, 0, 0, 0);
  const startTime = new Date(base);
  startTime.setHours(faker.number.int({ min: 9, max: 18 }) + hourOffset, 0, 0, 0);
  const endTime = new Date(startTime.getTime() + 90 * 60 * 1000);
  return { date, startTime, endTime };
}

type RequestSeed = Prisma.SchedulingRequestUncheckedCreateInput & { id: string };

// Statuses that should have a match (will get matchId set later by matches seeder)
export type CompletedRequestSeed = {
  id: string;
  hostUserId: string;
  hostPartnerUserId: string | null;
  format: 'singles' | 'doubles';
  sportType: 'tennis' | 'padel';
  matchType: 'competitive' | 'practice';
  date: Date;
  startTime: Date;
};

export async function seedSchedulingRequests(
  users: { id: string }[],
  usersWithPhone: { id: string; phone: string | null }[]
): Promise<{ requests: RequestSeed[]; completedRequests: CompletedRequestSeed[] }> {
  const usedTokens = new Set<string>();
  const requests: RequestSeed[] = [];

  function token(): string {
    let t: string;
    do { t = generateInviteToken(); } while (usedTokens.has(t));
    usedTokens.add(t);
    return t;
  }

  function pickSportAndFormat(): { sportType: 'tennis' | 'padel'; format: 'singles' | 'doubles' } {
    const sport = faker.helpers.arrayElement(['tennis', 'padel'] as const);
    return sport === 'padel'
      ? { sportType: 'padel', format: 'doubles' }
      : { sportType: 'tennis', format: faker.datatype.boolean({ probability: 0.8 }) ? 'singles' : 'doubles' };
  }

  function partnerFor(hostId: string): string | null {
    const partner = usersWithPhone.find((u) => u.id !== hostId && u.phone);
    return partner?.id ?? null;
  }

  // ─── Dev user: one scenario per filter tab ───────────────────────────────
  const devUser = usersWithPhone.find((u) => u.id === DEV_USER_ID && u.phone);
  if (devUser) {
    type Scenario = { status: RequestSeed['status']; date: Date; label: string; sport?: 'tennis' | 'padel'; format?: 'singles' | 'doubles' };

    const scenarios: Scenario[] = [
      // Active (future) — shown in "Active" tab
      { status: 'active', date: faker.date.soon({ days: 4 }),  label: 'Active 1', sport: 'tennis', format: 'singles' },
      { status: 'active', date: faker.date.soon({ days: 8 }),  label: 'Active 2', sport: 'padel',  format: 'doubles' },
      // Expired + future date — shown in "Expired" tab
      { status: 'expired', date: faker.date.soon({ days: 3 }),  label: 'Expired future 1', sport: 'tennis', format: 'singles' },
      { status: 'expired', date: faker.date.soon({ days: 12 }), label: 'Expired future 2', sport: 'padel',  format: 'doubles' },
      // Expired + past date — shown in "Past" tab
      { status: 'expired', date: faker.date.recent({ days: 5 }),  label: 'Expired past 1', sport: 'tennis', format: 'singles' },
      { status: 'expired', date: faker.date.recent({ days: 12 }), label: 'Expired past 2', sport: 'padel',  format: 'doubles' },
      // Completed + past date (will have matches) — shown in "Confirmed" tab
      { status: 'completed', date: faker.date.recent({ days: 3 }),  label: 'Completed past 1', sport: 'tennis', format: 'singles' },
      { status: 'completed', date: faker.date.recent({ days: 20 }), label: 'Completed past 2', sport: 'padel',  format: 'doubles' },
      // Completed + future date (upcoming confirmed match) — shown in "Confirmed" tab
      { status: 'completed', date: faker.date.soon({ days: 6 }), label: 'Completed future', sport: 'tennis', format: 'singles' },
      // Cancelled — shown in "Cancelled" tab
      { status: 'cancelled', date: faker.date.recent({ days: 8 }), label: 'Cancelled 1', sport: 'padel', format: 'doubles' },
    ];

    for (const s of scenarios) {
      const { date, startTime, endTime } = makeTime(s.date);
      const sf = s.sport && s.format ? { sportType: s.sport, format: s.format } : pickSportAndFormat();
      const hostPartnerUserId = sf.format === 'doubles' ? partnerFor(devUser.id) : null;
      requests.push({
        hostUserId: devUser.id,
        hostPartnerUserId,
        sportType: sf.sportType,
        format: sf.format,
        matchType: 'competitive',
        date,
        startTime,
        endTime,
        locationText: faker.location.streetAddress(),
        radiusKm: 20,
        responseWindowMinutes: 240,
        maxParallelCandidates: 1,
        inviteToken: token(),
        status: s.status,
        timezone: 'Europe/Madrid',
      });
    }
  }

  // ─── Other users: random mix of past + future, all statuses ─────────────
  const hostsWithPhone = usersWithPhone.filter((u) => u.phone && u.id !== DEV_USER_2_ID && u.id !== DEV_USER_ID);
  const hostCount = Math.min(30, hostsWithPhone.length);

  for (let i = 0; i < hostCount; i++) {
    const host = faker.helpers.arrayElement(hostsWithPhone);
    const { sportType, format } = pickSportAndFormat();
    const hostPartnerUserId = format === 'doubles' ? partnerFor(host.id) : null;

    const status = faker.helpers.weightedArrayElement([
      { weight: 4, value: 'active' as const },
      { weight: 3, value: 'completed' as const },
      { weight: 2, value: 'expired' as const },
      { weight: 1, value: 'cancelled' as const },
    ]);

    // Active → future; completed/expired/cancelled → mix of past and future
    const usePast = status === 'active'
      ? false
      : faker.datatype.boolean({ probability: 0.6 });

    const rawDate = usePast
      ? faker.date.recent({ days: 30 })
      : faker.date.soon({ days: 14 });
    const { date, startTime, endTime } = makeTime(rawDate);

    requests.push({
      hostUserId: host.id,
      hostPartnerUserId,
      sportType,
      format,
      matchType: faker.datatype.boolean({ probability: 0.8 }) ? 'competitive' : 'practice',
      date,
      startTime,
      endTime,
      locationText: faker.location.streetAddress(),
      radiusKm: faker.number.float({ min: 5, max: 50, multipleOf: 1 }),
      responseWindowMinutes: faker.helpers.arrayElement([60, 120, 240, 600]),
      maxParallelCandidates: 1,
      inviteToken: token(),
      status,
      timezone: 'UTC',
    });
  }

  const created = requests.length > 0
    ? await batchInsert(requests, 10, (r) =>
        prisma.schedulingRequest.create({ data: r })
      )
    : [];

  // Build the list of completed requests (matches seeder will create matches for these)
  const completedRequests: CompletedRequestSeed[] = created
    .filter((r: any) => r.status === 'completed')
    .map((r: any) => ({
      id: r.id,
      hostUserId: r.hostUserId,
      hostPartnerUserId: r.hostPartnerUserId ?? null,
      format: r.format as 'singles' | 'doubles',
      sportType: r.sportType as 'tennis' | 'padel',
      matchType: r.matchType as 'competitive' | 'practice',
      date: r.date instanceof Date ? r.date : new Date(r.date),
      startTime: r.startTime instanceof Date ? r.startTime : new Date(r.startTime),
    }));

  console.log(`  schedulingRequests: ${created.length} (${completedRequests.length} completed)`);
  return { requests: created as RequestSeed[], completedRequests };
}
