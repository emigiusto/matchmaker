/**
 * Test scheduling flow locally.
 * Run: npx tsx scripts/test-scheduling.ts          (singles)
 * Run: TEST_DOUBLES=1 npx tsx scripts/test-scheduling.ts   (doubles, 4 people)
 * Prerequisite: Server running (npm run dev) and DB with users with phones.
 */

/// <reference types="node" />
import 'dotenv/config';
import process from 'process';
import type { User } from '@prisma/client';
import prisma from '../src/config/database';
const BASE = process.env.BASE_URL || 'http://localhost:3000';
const IS_DOUBLES = process.env.TEST_DOUBLES === '1' || process.env.TEST_DOUBLES === 'true' || process.argv.includes('doubles');

async function getOrCreateTestUsers(count: number) {
  const withPhone = await prisma.user.findMany({
    where: { phone: { not: null } },
    take: count,
  });
  if (withPhone.length >= count) {
    return withPhone;
  }
  const names = ['Test Host', 'Test Host Partner', 'Test Carlos', 'Test Pablo'].slice(0, count);
  const phones = ['34611111111', '34611111112', '34622222222', '34633333333'].slice(0, count);
  const users: User[] = [];
  for (let i = 0; i < count; i++) {
    const u = await prisma.user.upsert({
      where: { phone: phones[i] },
      create: { name: names[i], phone: phones[i], isGuest: false },
      update: {},
    });
    users.push(u);
  }
  return users;
}

async function main() {
  const userCount = IS_DOUBLES ? 4 : 3;
  console.log(`Fetching or creating ${userCount} test users (${IS_DOUBLES ? 'doubles' : 'singles'})...`);
  const users = await getOrCreateTestUsers(userCount);
  const host = users[0];
  const hostPartner = IS_DOUBLES ? users[1] : null;
  const c1 = users[IS_DOUBLES ? 2 : 1];
  const c2 = users[IS_DOUBLES ? 3 : 2];

  console.log('Host:', host.id, host.name, host.phone);
  if (hostPartner) console.log('Host Partner:', hostPartner.id, hostPartner.name, hostPartner.phone);
  console.log('Candidate 1:', c1.id, c1.name, c1.phone);
  console.log('Candidate 2:', c2.id, c2.name, c2.phone);

  console.log('\n1. Creating scheduling request...');
  const createBody: Record<string, unknown> = {
    hostUserId: host.id,
    sportType: IS_DOUBLES ? 'padel' : 'tennis',
    format: IS_DOUBLES ? 'doubles' : 'singles',
    matchType: 'competitive',
    date: '2026-03-12',
    startTime: '2026-03-12T18:00:00.000Z',
    endTime: '2026-03-12T19:30:00.000Z',
    locationText: 'Barcelona Club',
    radiusKm: 10,
    responseWindowMinutes: 60,
    candidateUserIds: [c1.id, c2.id],
  };
  if (IS_DOUBLES && hostPartner) {
    createBody.hostPartnerUserId = hostPartner.id;
  }

  const createRes = await fetch(`${BASE}/scheduling`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(createBody),
  });
  if (!createRes.ok) {
    console.error('Create failed:', createRes.status, await createRes.text());
    process.exit(1);
  }
  const req = (await createRes.json()) as { id: string };
  const requestId = req.id;
  console.log('   Request ID:', requestId);

  console.log('\n2. Starting scheduling (first invite sent)...');
  const startRes = await fetch(`${BASE}/scheduling/${requestId}/start`, {
    method: 'POST',
  });
  if (!startRes.ok) {
    console.error('Start failed:', startRes.status, await startRes.text());
    process.exit(1);
  }
  const started = await startRes.json();
  console.log('   Status:', started.status);
  console.log('   Candidates:', started.candidates?.map((c: { status: string; contactUserName?: string }) => `${c.contactUserName}: ${c.status}`).join(', '));

  console.log('\n3. Simulate webhook: candidate 1 DECLINES...');
  const phone1 = (c1.phone || '').replace(/\D/g, '');
  const declineRes = await fetch(`${BASE}/whatsapp/webhook`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: phone1,
      body: { text: 'NO' },
    }),
  });
  console.log('   Response:', await declineRes.json());

  console.log('\n4. Simulate webhook: candidate 2 ACCEPTS...');
  const phone2 = (c2.phone || '').replace(/\D/g, '');
  const acceptRes = await fetch(`${BASE}/whatsapp/webhook`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: phone2,
      body: { text: 'YES' },
    }),
  });
  console.log('   Response:', await acceptRes.json());

  console.log('\n5. Final request state...');
  const finalRes = await fetch(`${BASE}/scheduling/${requestId}`);
  const final = await finalRes.json();
  console.log('   Status:', final.status);
  console.log('   Match ID:', final.matchId);

  console.log('\n✓ Scheduling flow test complete.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
