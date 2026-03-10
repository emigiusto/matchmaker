/// <reference types="node" />
import { randomBytes } from 'crypto';
import { faker } from '@faker-js/faker';
import { batchInsert } from './batchInsert.util';
import { PrismaClient } from '@prisma/client';
import type { Prisma } from '@prisma/client';

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

  const hostsWithPhone = usersWithPhone.filter((u) => u.phone);
  const hostCount = Math.min(25, Math.floor(hostsWithPhone.length / 2));

  for (let i = 0; i < hostCount; i++) {
    const host = faker.helpers.arrayElement(hostsWithPhone);
    const format = faker.datatype.boolean({ probability: 0.8 }) ? 'singles' : 'doubles';

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
      sportType: faker.helpers.arrayElement(['tennis', 'padel']),
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

  if (requests.length === 0) return [];
  return batchInsert(requests, 10, (r) =>
    prisma.schedulingRequest.create({
      data: r as Prisma.SchedulingRequestUncheckedCreateInput,
    })
  );
}
