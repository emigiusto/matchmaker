import bcrypt from 'bcryptjs';
import { faker } from '@faker-js/faker';
import { batchInsert } from './batchInsert.util';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const SALT_ROUNDS = 10;
const DEV_PASSWORD = process.env.DEV_USER_PASSWORD || 'dev123';

type UserSeed = {
  name: string;
  phone: string;
  email: string | null;
  isGuest: boolean;
};

/** Fixed dev user ID for frontend API wiring (must match VITE_CURRENT_USER_ID in frontend .env) */
export const DEV_USER_ID = '023eddcc-c568-4091-8d7b-354a1744c7d4';

/** Secondary dev user for scheduling flow testing (use as candidate, invitee, or switch VITE_CURRENT_USER_ID) */
export const DEV_USER_2_ID = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';

export async function seedUsers() {
  const usedPhones = new Set<string>(['+34 600 000 001', '+34 600 000 002']);
  const usedEmails = new Set<string>(['alex@example.com', 'jordan@example.com']);
  const users: UserSeed[] = [];

  const devPasswordHash = bcrypt.hashSync(DEV_PASSWORD, SALT_ROUNDS);

  // Create primary dev user (fixed ID for frontend VITE_CURRENT_USER_ID)
  const devUser = await prisma.user.create({
    data: {
      id: DEV_USER_ID,
      name: 'Alex Rivera',
      phone: '+34 600 000 001',
      email: 'alex@example.com',
      passwordHash: devPasswordHash,
      isGuest: false,
    },
  });

  // Create secondary dev user (for scheduling flow: use as candidate, invitee, or switch current user)
  const devUser2 = await prisma.user.create({
    data: {
      id: DEV_USER_2_ID,
      name: 'Jordan Kim',
      phone: '+34 600 000 002',
      email: 'jordan@example.com',
      passwordHash: devPasswordHash,
      isGuest: false,
    },
  });

  for (let i = 0; i < 298; i++) {
    let phone: string;
    do {
      phone = faker.phone.number({ style: 'international' }) + i;
    } while (usedPhones.has(phone));
    usedPhones.add(phone);

    let email: string | null = null;
    if (faker.datatype.boolean()) {
      do {
        email = faker.internet.email();
      } while (email && usedEmails.has(email));
      if (email) usedEmails.add(email);
    }

    users.push({
      name: faker.person.fullName(),
      phone,
      email,
      isGuest: faker.datatype.boolean(),
    });
  }

  const created = await batchInsert(users, 20, (user) =>
    prisma.user.create({ data: user })
  );
  return [devUser, devUser2, ...created];
}
