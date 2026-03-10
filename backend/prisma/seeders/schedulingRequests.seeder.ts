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

type RequestData = {
  hostUserId: string;
  hostPartnerUserId: string | null;
  sportType: 'tennis' | 'padel';
  format: 'singles' | 'doubles';
  matchType: 'competitive' | 'practice';
  date: Date;
  startTime: Date;
  endTime: Date;
  locationText: string;
  radiusKm: number | null;
  responseWindowMinutes: number;
  inviteToken: string;
  status: 'active' | 'paused' | 'completed' | 'expired';
};

export async function seedSchedulingRequests(
  users: { id: string }[],
  usersWithPhone: { id: string; phone: string | null }[]
) {
  const usedTokens = new Set<string>();
  const requests: RequestData[] = [];

  // Padel is always doubles; tennis can be singles or doubles
  const pickSportAndFormat = (): { sportType: 'tennis' | 'padel'; format: 'singles' | 'doubles' } => {
    const sport = faker.helpers.arrayElement(['tennis', 'padel']);
    return sport === 'padel'
      ? { sportType: 'padel', format: 'doubles' }
      : { sportType: 'tennis', format: faker.datatype.boolean({ probability: 0.8 }) ? 'singles' : 'doubles' };
  };

  // Guarantee 2 active scheduling requests for the dev user (for /play My Requests)
  const devUser = usersWithPhone.find((u) => u.id === DEV_USER_ID && u.phone);
  if (devUser) {
    for (let i = 0; i < 2; i++) {
      let token: string;
      do {
        token = generateInviteToken();
      } while (usedTokens.has(token));
      usedTokens.add(token);
      const date = faker.date.soon({ days: 14 });
      const startTime = new Date(date);
      startTime.setHours(faker.number.int({ min: 9, max: 18 }), 0, 0, 0);
      const endTime = new Date(startTime.getTime() + 90 * 60 * 1000);
      const { sportType, format } = pickSportAndFormat();
      let hostPartnerUserId: string | null = null;
      if (format === 'doubles') {
        const partner = usersWithPhone.find((u) => u.id !== devUser.id && u.phone);
        if (partner) hostPartnerUserId = partner.id;
      }
      requests.push({
        hostUserId: devUser.id,
        hostPartnerUserId,
        sportType,
        format,
        matchType: 'competitive' as const,
        date,
        startTime,
        endTime,
        locationText: faker.location.streetAddress(),
        radiusKm: 20,
        responseWindowMinutes: 240,
        inviteToken: token,
        status: 'active',
      });
    }
  }

  // Exclude secondary dev user from being a host so they can test scheduling from scratch
  const hostsWithPhone = usersWithPhone.filter((u) => u.phone && u.id !== DEV_USER_2_ID);
  const hostCount = Math.min(25, Math.floor(hostsWithPhone.length / 2));

  for (let i = 0; i < hostCount; i++) {
    const host = faker.helpers.arrayElement(hostsWithPhone);
    const { sportType, format } = pickSportAndFormat();

    let hostPartnerUserId: string | null = null;
    if (format === 'doubles') {
      const partner = usersWithPhone.find((u) => u.id !== host.id && u.phone);
      if (partner) hostPartnerUserId = partner.id;
    }

    let token: string;
    do {
      token = generateInviteToken();
    } while (usedTokens.has(token));
    usedTokens.add(token);

    const date = faker.date.soon({ days: 14 });
    const startTime = new Date(date);
    startTime.setHours(faker.number.int({ min: 9, max: 18 }), 0, 0, 0);
    const endTime = new Date(startTime.getTime() + 90 * 60 * 1000);

    const status = faker.helpers.weightedArrayElement([
      { weight: 5, value: 'active' },
      { weight: 2, value: 'paused' },
      { weight: 2, value: 'completed' },
      { weight: 1, value: 'expired' },
    ]);

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
      inviteToken: token,
      status,
    });
  }

  const created = requests.length > 0
    ? await batchInsert(requests, 10, (r) =>
        prisma.schedulingRequest.create({
          data: r as Prisma.SchedulingRequestUncheckedCreateInput,
        })
      )
    : [];

  // Guarantee dev user has scheduling requests (fallback if not in usersWithPhone)
  const existingCount = await prisma.schedulingRequest.count({
    where: { hostUserId: DEV_USER_ID },
  });
  if (existingCount === 0) {
    const devUser = await prisma.user.findUnique({ where: { id: DEV_USER_ID } });
    if (devUser && devUser.phone) {
      for (let i = 0; i < 2; i++) {
        let token: string;
        do {
          token = generateInviteToken();
        } while (usedTokens.has(token));
        usedTokens.add(token);
        const date = faker.date.soon({ days: 14 });
        const startTime = new Date(date);
        startTime.setHours(faker.number.int({ min: 9, max: 18 }), 0, 0, 0);
        const endTime = new Date(startTime.getTime() + 90 * 60 * 1000);
        const { sportType, format } = pickSportAndFormat();
        let hostPartnerUserId: string | null = null;
        if (format === 'doubles') {
          const partner = await prisma.user.findFirst({
            where: { id: { not: DEV_USER_ID }, phone: { not: null } },
          });
          if (partner) hostPartnerUserId = partner.id;
        }
        await prisma.schedulingRequest.create({
          data: {
            hostUserId: DEV_USER_ID,
            hostPartnerUserId,
            sportType,
            format,
            matchType: 'competitive',
            date,
            startTime,
            endTime,
            locationText: faker.location.streetAddress(),
            radiusKm: 20,
            responseWindowMinutes: 240,
            inviteToken: token,
            status: 'active',
          } as Prisma.SchedulingRequestUncheckedCreateInput,
        });
      }
      const fallbackCreated = await prisma.schedulingRequest.findMany({
        where: { hostUserId: DEV_USER_ID },
      });
      return [...(Array.isArray(created) ? created : []), ...fallbackCreated];
    }
  }

  return created;
}
