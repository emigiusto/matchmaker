import { faker } from '@faker-js/faker';
import { batchInsert } from './batchInsert.util';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

type GuestContactSeed = {
  ownerUserId: string;
  name: string;
  phone: string;
};

export async function seedGuestContacts(users: { id: string }[]) {
  const usedPhones = new Set<string>();
  const contacts: GuestContactSeed[] = [];

  for (const user of users) {
    const count = faker.number.int({ min: 0, max: 5 });
    for (let i = 0; i < count; i++) {
      let phone: string;
      do {
        phone = faker.phone.number({ style: 'international' }) + '-' + user.id.slice(0, 4) + '-' + i;
      } while (usedPhones.has(phone));
      usedPhones.add(phone);

      contacts.push({
        ownerUserId: user.id,
        name: faker.person.fullName(),
        phone,
      });
    }
  }

  if (contacts.length === 0) return [];
  return batchInsert(contacts, 30, (c) =>
    prisma.guestContact.create({ data: c })
  );
}
