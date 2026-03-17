import { faker } from '@faker-js/faker';
import { batchInsert } from './batchInsert.util';
import { PrismaClient } from '@prisma/client';
import { DEV_USER_ID } from './users.seeder';

const prisma = new PrismaClient();

type ContactSeed = {
  ownerUserId: string;
  name: string;
  phone: string;
  linkedUserId?: string;
};

export async function seedContacts(users: { id: string }[]) {
  const usedPhones = new Set<string>();
  const contacts: ContactSeed[] = [];

  const devUser = users.find((u) => u.id === DEV_USER_ID);
  const otherUsers = users.filter((u) => u.id !== DEV_USER_ID);

  // Dev user: fixed manual (unlinked) contacts for I Want to Play flow
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

    // Dev user: some contacts linked to real registered users (was Friendship)
    const linkedFriends = faker.helpers.arrayElements(otherUsers, Math.min(5, otherUsers.length));
    for (const friend of linkedFriends) {
      const phone = faker.phone.number({ style: 'international' }) + '-' + devUser.id.slice(0, 4) + '-lnk';
      if (!usedPhones.has(phone)) {
        usedPhones.add(phone);
        contacts.push({
          ownerUserId: devUser.id,
          name: faker.person.fullName(),
          phone,
          linkedUserId: friend.id,
        });
      }
    }
  }

  for (const user of users) {
    // Unlinked contacts (name + phone only, was GuestContact)
    const unlinkedCount = faker.number.int({ min: 0, max: 5 });
    for (let i = 0; i < unlinkedCount; i++) {
      let phone: string;
      do {
        phone = faker.phone.number({ style: 'international' }) + '-' + user.id.slice(0, 4) + '-' + i;
      } while (usedPhones.has(phone));
      usedPhones.add(phone);
      contacts.push({ ownerUserId: user.id, name: faker.person.fullName(), phone });
    }

    // Linked contacts pointing to other registered users (was user-to-user Friendship)
    if (faker.datatype.boolean({ probability: 0.5 })) {
      const pool = users.filter((u) => u.id !== user.id);
      const linkedCount = faker.number.int({ min: 1, max: 3 });
      const linkedUsers = faker.helpers.arrayElements(pool, Math.min(linkedCount, pool.length));
      for (const linkedUser of linkedUsers) {
        let phone: string;
        do {
          phone = faker.phone.number({ style: 'international' }) + '-' + user.id.slice(0, 4) + '-lnk';
        } while (usedPhones.has(phone));
        usedPhones.add(phone);
        contacts.push({
          ownerUserId: user.id,
          name: faker.person.fullName(),
          phone,
          linkedUserId: linkedUser.id,
        });
      }
    }
  }

  if (contacts.length === 0) return [];
  return batchInsert(contacts, 30, (c) =>
    prisma.contact.create({ data: c })
  );
}
