import { faker } from '@faker-js/faker';
import { batchInsert } from './batchInsert.util';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

type SchedulingCandidateSeed = {
  schedulingRequestId: string;
  contactUserId: string;
  priorityOrder: number;
  status: 'pending' | 'contacted' | 'waiting_reply' | 'accepted' | 'declined' | 'expired';
  contactedAt?: Date | null;
  responseAt?: Date | null;
};

const MAX_ACCEPTED_SINGLES = 1;
const MAX_ACCEPTED_DOUBLES = 2;
const MAX_IN_PROGRESS = 3;

type Req = {
  id: string;
  hostUserId: string;
  hostPartnerUserId: string | null;
  format?: string;
  status?: string;
};

export async function seedSchedulingCandidates(
  requests: Req[],
  usersWithPhone: { id: string; phone: string | null }[]
) {
  const candidates: SchedulingCandidateSeed[] = [];
  const requestsToComplete: string[] = [];
  const requestCurrentIndex: { id: string; index: number }[] = [];

  const contactUsers = usersWithPhone.filter((u) => u.phone);

  for (const request of requests) {
    const excludeIds = new Set([request.hostUserId]);
    if (request.hostPartnerUserId) excludeIds.add(request.hostPartnerUserId);

    const pool = contactUsers.filter((u) => !excludeIds.has(u.id));
    if (pool.length === 0) continue;

    const count = faker.number.int({ min: 3, max: 8 });
    const chosen = faker.helpers.arrayElements(pool, Math.min(count, pool.length));

    const format = request.format === 'doubles' ? 'doubles' : 'singles';
    const reqStatus = request.status ?? 'active';
    const maxAccepted = format === 'doubles' ? MAX_ACCEPTED_DOUBLES : MAX_ACCEPTED_SINGLES;

    // Rules:
    // 1. Singles + 1 accepted → request must be completed
    // 2. If active/paused (scheduling): at least 1 in progress
    // 3. No skipping: order = [previous] [in_progress] [pending]
    // 4. Max 3 in progress

    const inProgressStatuses = ['contacted', 'waiting_reply'] as const;
    const previousStatuses = ['accepted', 'declined', 'expired'] as const;

    let previousCount: number;
    let inProgressCount: number;
    let acceptedCount: number;

    if (reqStatus === 'completed') {
      acceptedCount = format === 'singles' ? 1 : 2;
      previousCount = faker.number.int({ min: acceptedCount, max: Math.min(chosen.length - 1, acceptedCount + 3) });
      previousCount = Math.max(previousCount, acceptedCount);
      inProgressCount = 0;
    } else if (reqStatus === 'active' || reqStatus === 'paused') {
      acceptedCount = 0;
      previousCount = faker.number.int({ min: 0, max: Math.max(0, chosen.length - 2) });
      inProgressCount = faker.number.int({ min: 1, max: Math.min(MAX_IN_PROGRESS, chosen.length - previousCount) });
    } else {
      acceptedCount = 0;
      previousCount = faker.number.int({ min: 0, max: chosen.length - 1 });
      inProgressCount = 0;
    }

    const pendingCount = chosen.length - previousCount - inProgressCount;
    if (previousCount < 0 || inProgressCount < 0 || pendingCount < 0) continue;

    const batch: Omit<SchedulingCandidateSeed, 'priorityOrder'>[] = [];
    const recent = faker.date.recent({ days: 2 });

    for (let i = 0; i < chosen.length; i++) {
      const user = chosen[i];
      let status: SchedulingCandidateSeed['status'];
      let contactedAt: Date | null = null;
      let responseAt: Date | null = null;

      if (i < previousCount) {
        if (i < acceptedCount) {
          status = 'accepted';
        } else {
          status = faker.helpers.arrayElement(['declined', 'expired']);
        }
        contactedAt = recent;
        if (status === 'accepted' || status === 'declined') {
          responseAt = new Date(recent.getTime() + 60 * 60 * 1000);
        }
      } else if (i < previousCount + inProgressCount) {
        status = faker.helpers.arrayElement(inProgressStatuses);
        contactedAt = recent;
      } else {
        status = 'pending';
      }

      batch.push({
        schedulingRequestId: request.id,
        contactUserId: user.id,
        status,
        contactedAt: contactedAt ?? undefined,
        responseAt: responseAt ?? undefined,
      });
    }

    batch.forEach((c, idx) => {
      candidates.push({ ...c, priorityOrder: idx });
    });

    if (acceptedCount > 0 && (format === 'singles' || (format === 'doubles' && acceptedCount === 2))) {
      requestsToComplete.push(request.id);
    }
    if (inProgressCount > 0) {
      requestCurrentIndex.push({ id: request.id, index: previousCount });
    }
  }

  if (candidates.length === 0) return [];

  await batchInsert(candidates, 30, (c) =>
    prisma.schedulingCandidate.create({
      data: {
        schedulingRequestId: c.schedulingRequestId,
        contactUserId: c.contactUserId,
        priorityOrder: c.priorityOrder,
        status: c.status,
        contactedAt: c.contactedAt ?? null,
        responseAt: c.responseAt ?? null,
      },
    })
  );

  if (requestsToComplete.length > 0) {
    await prisma.schedulingRequest.updateMany({
      where: { id: { in: requestsToComplete } },
      data: { status: 'completed' },
    });
  }

  for (const { id, index } of requestCurrentIndex) {
    await prisma.schedulingRequest.update({
      where: { id },
      data: { currentCandidateIndex: index },
    });
  }

  return candidates;
}
