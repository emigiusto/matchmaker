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

export async function seedUsers() {
  const usedPhones = new Set<string>();
  const usedEmails = new Set<string>();
  const users: UserSeed[] = [];

  for (let i = 0; i < 300; i++) {
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

  return batchInsert(users, 20, (user) =>
    prisma.user.create({ data: user })
  );
}
