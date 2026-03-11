import { faker } from '@faker-js/faker';
import { batchInsert } from './batchInsert.util';
import { PrismaClient } from '@prisma/client';
import { DEV_USER_ID } from './users.seeder';

const prisma = new PrismaClient();

type GuestContactSeed = {
  ownerUserId: string;
  name: string;
  phone: string;
};

export async function seedGuestContacts(users: { id: string }[]) {
  const usedPhones = new Set<string>();
  const contacts: GuestContactSeed[] = [];

  // Add sample manual contacts for dev user (I Want to Play flow)
  const devUser = users.find((u) => u.id === DEV_USER_ID);
  if (devUser) {
    const manualContacts = [
      { name: 'Maria Lopez', phone: '+34 612 111 222' },
      { name: 'Carlos Ruiz', phone: '+34 613 333 444' },
    ];
    for (const { name, phone } of manualContacts) {
      const uniquePhone = phone + '-' + devUser.id.slice(0, 4);
      if (!usedPhones.has(uniquePhone)) {
        usedPhones.add(uniquePhone);
        contacts.push({ ownerUserId: devUser.id, name, phone: uniquePhone });
      }
    }
  }

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
