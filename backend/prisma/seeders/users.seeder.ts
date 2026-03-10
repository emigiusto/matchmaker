import { faker } from '@faker-js/faker';
import { batchInsert } from './batchInsert.util';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

type UserSeed = {
  name: string;
  phone: string;
  email: string | null;
  isGuest: boolean;
};

/** Fixed dev user ID for frontend API wiring (no auth yet) */
export const DEV_USER_ID = 'user-001';

export async function seedUsers() {
  const usedPhones = new Set<string>();
  const usedEmails = new Set<string>();
  const users: UserSeed[] = [];

  // Create dev user first (fixed ID for frontend VITE_CURRENT_USER_ID)
  const devUser = await prisma.user.create({
    data: {
      id: DEV_USER_ID,
      name: 'Alex Rivera',
      phone: '+34 600 000 001',
      email: 'alex@example.com',
      isGuest: false,
    },
  });

  for (let i = 0; i < 299; i++) {
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
  return [devUser, ...created];
}
