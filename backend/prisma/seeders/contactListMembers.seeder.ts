import { faker } from '@faker-js/faker';
import { batchInsert } from './batchInsert.util';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

type ContactListMemberSeed = {
  contactListId: string;
  contactId: string;
};

export async function seedContactListMembers(
  contactLists: { id: string; ownerUserId: string }[],
  contacts: { id: string; ownerUserId: string }[]
) {
  const usedPairs = new Set<string>();
  const members: ContactListMemberSeed[] = [];

  for (const list of contactLists) {
    // Only contacts owned by the list owner can be added to their list
    const ownerContacts = contacts.filter((c) => c.ownerUserId === list.ownerUserId);
    if (ownerContacts.length === 0) continue;

    const maxMembers = Math.min(12, ownerContacts.length);
    const memberCount = faker.number.int({ min: Math.min(2, maxMembers), max: maxMembers });
    const chosen = faker.helpers.arrayElements(ownerContacts, memberCount);

    for (const contact of chosen) {
      const key = `${list.id}-${contact.id}`;
      if (usedPairs.has(key)) continue;
      usedPairs.add(key);
      members.push({ contactListId: list.id, contactId: contact.id });
    }
  }

  if (members.length === 0) return [];
  return batchInsert(members, 30, (m) =>
    prisma.contactListMember.create({ data: m })
  );
}
