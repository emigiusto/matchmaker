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

export async function seedSchedulingCandidates(
  requests: { id: string; hostUserId: string; hostPartnerUserId: string | null }[],
  usersWithPhone: { id: string; phone: string | null }[]
) {
  const candidates: SchedulingCandidateSeed[] = [];

  const contactUsers = usersWithPhone.filter((u) => u.phone);

  for (const request of requests) {
    const excludeIds = new Set([request.hostUserId]);
    if (request.hostPartnerUserId) excludeIds.add(request.hostPartnerUserId);

    const pool = contactUsers.filter((u) => !excludeIds.has(u.id));
    const count = faker.number.int({ min: 2, max: 8 });
    const chosen = faker.helpers.arrayElements(pool, Math.min(count, pool.length));

    chosen.forEach((user, idx) => {
      const status = faker.helpers.weightedArrayElement([
        { weight: 3, value: 'pending' as const },
        { weight: 2, value: 'contacted' as const },
        { weight: 2, value: 'waiting_reply' as const },
        { weight: 2, value: 'accepted' as const },
        { weight: 1, value: 'declined' as const },
        { weight: 1, value: 'expired' as const },
      ]);

      const contactedAt = ['contacted', 'waiting_reply', 'accepted', 'declined'].includes(status)
        ? faker.date.recent({ days: 2 })
        : null;
      const responseAt = ['accepted', 'declined'].includes(status)
        ? contactedAt ? new Date(contactedAt.getTime() + 60 * 60 * 1000) : null
        : null;

      candidates.push({
        schedulingRequestId: request.id,
        contactUserId: user.id,
        priorityOrder: idx,
        status,
        contactedAt: contactedAt ?? undefined,
        responseAt: responseAt ?? undefined,
      });
    });
  }

  if (candidates.length === 0) return [];
  return batchInsert(candidates, 30, (c) =>
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
}
