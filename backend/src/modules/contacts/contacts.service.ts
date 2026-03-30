// contacts.service.ts
// Unified contacts + contact lists service
// Replaces guest-contacts, friendships, and groups modules

import { prisma } from '../../prisma';
import { AppError } from '../../shared/errors/AppError';
import { logServerEvent } from '../analytics/analytics.service';
import { normalizePhoneToCanonical } from '../../shared/utils/phone.utils';
import { findUserByNormalizedPhone } from '../users/users.service';
import type { Contact, Prisma } from '@prisma/client';
import type {
  ContactDTO,
  ContactListDTO,
  CreateContactInput,
  CreateContactResultDTO,
  UpdateContactInput,
} from './contacts.types';

// ─── Phone helpers ──────────────────────────────────────────

function toStoredPhone(phone: string): string {
  const canonical = normalizePhoneToCanonical(phone);
  return canonical ? `+${canonical}` : phone.trim();
}

// ─── DTO mappers ────────────────────────────────────────────

function toContactDTO(
  c: Contact & { linkedUser?: { id: string; name: string | null; isGuest: boolean } | null },
): ContactDTO {
  return {
    id: c.id,
    ownerUserId: c.ownerUserId,
    name: c.name,
    phone: c.phone,
    socioNumbers: (c.socioNumbers as Record<string, string>) ?? {},
    linkedUserId: c.linkedUserId ?? null,
    linkedUserName: c.linkedUser?.name ?? null,
    linkedUserIsGuest: c.linkedUser?.isGuest ?? null,
    importSource: c.importSource ?? null,
    communicationLanguage: c.communicationLanguage,
    createdAt: c.createdAt.toISOString(),
    updatedAt: c.updatedAt.toISOString(),
  };
}

// ─── Contacts ───────────────────────────────────────────────

/**
 * Create a contact. If a contact with the same phone already exists under this
 * owner, throws a 409 with a message naming the existing contact.
 * Immediately attempts to link to a registered User by phone.
 */
export async function createContact(input: CreateContactInput): Promise<CreateContactResultDTO> {
  const owner = await prisma.user.findUnique({ where: { id: input.ownerUserId } });
  if (!owner) throw new AppError('User not found', 404);

  const name = input.name.trim();
  const storedPhone = toStoredPhone(input.phone);

  // Duplicate check
  const existing = await prisma.contact.findUnique({
    where: { ownerUserId_phone: { ownerUserId: input.ownerUserId, phone: storedPhone } },
  });
  if (existing) {
    throw new AppError(`You already have ${existing.name} at this number`, 409);
  }

  // Resolve or create the linked User
  let linkedUserId: string | null = null;
  let resolvedUser: { id: string; name: string | null };

  const existingUser = await findUserByNormalizedPhone(input.phone);
  if (existingUser) {
    linkedUserId = existingUser.id;
    resolvedUser = { id: existingUser.id, name: existingUser.name ?? null };
  } else {
    const created = await prisma.user.create({
      data: { name, phone: storedPhone, isGuest: true },
    });
    linkedUserId = created.id;
    resolvedUser = { id: created.id, name: created.name ?? null };
  }

  const contact = await prisma.contact.create({
    data: {
      ownerUserId: input.ownerUserId,
      name,
      phone: storedPhone,
      linkedUserId,
      importSource: input.importSource ?? 'manual',
      externalId: input.externalId ?? null,
      socioNumbers: {},
      communicationLanguage: input.communicationLanguage ?? owner.locale ?? 'es',
    },
    include: { linkedUser: { select: { id: true, name: true, isGuest: true } } },
  });

  void logServerEvent(input.ownerUserId, 'contact.added', { contactId: contact.id });
  return { contact: toContactDTO(contact), user: resolvedUser };
}

export async function listContacts(ownerUserId: string): Promise<ContactDTO[]> {
  const contacts = await prisma.contact.findMany({
    where: { ownerUserId },
    include: { linkedUser: { select: { id: true, name: true, isGuest: true } } },
    orderBy: { name: 'asc' },
  });
  return contacts.map(toContactDTO);
}

export async function updateContact(
  id: string,
  ownerUserId: string,
  patch: UpdateContactInput,
): Promise<ContactDTO> {
  const contact = await prisma.contact.findUnique({ where: { id } });
  if (!contact) throw new AppError('Contact not found', 404);
  if (contact.ownerUserId !== ownerUserId) throw new AppError('Forbidden', 403);

  const data: Prisma.ContactUpdateInput = {};
  if (patch.name !== undefined) data.name = patch.name.trim();
  if (patch.socioNumbers !== undefined) data.socioNumbers = patch.socioNumbers;
  if (patch.communicationLanguage !== undefined) data.communicationLanguage = patch.communicationLanguage;

  const updated = await prisma.contact.update({
    where: { id },
    data,
    include: { linkedUser: { select: { id: true, name: true, isGuest: true } } },
  });
  return toContactDTO(updated);
}

export async function deleteContact(id: string, ownerUserId: string): Promise<void> {
  const contact = await prisma.contact.findUnique({ where: { id } });
  if (!contact) throw new AppError('Contact not found', 404);
  if (contact.ownerUserId !== ownerUserId) throw new AppError('Forbidden', 403);
  await prisma.contact.delete({ where: { id } });
}

/**
 * Resolve a Contact to a userId for scheduling.
 * If linkedUserId is already set, returns it.
 * Otherwise calls ensureUserByPhone, stores the link, and returns it.
 */
export async function resolveContactUserId(contactId: string): Promise<string> {
  const contact = await prisma.contact.findUnique({ where: { id: contactId } });
  if (!contact) throw new AppError('Contact not found', 404);

  if (contact.linkedUserId) return contact.linkedUserId;

  const storedPhone = toStoredPhone(contact.phone);
  const existing = await findUserByNormalizedPhone(contact.phone);
  let userId: string;

  if (existing) {
    userId = existing.id;
  } else {
    const created = await prisma.user.create({
      data: { name: contact.name, phone: storedPhone, isGuest: true },
    });
    userId = created.id;
  }

  await prisma.contact.update({ where: { id: contactId }, data: { linkedUserId: userId } });
  return userId;
}

// ─── Contact Lists ──────────────────────────────────────────

export async function createContactList(ownerUserId: string, name: string): Promise<ContactListDTO> {
  const owner = await prisma.user.findUnique({ where: { id: ownerUserId } });
  if (!owner) throw new AppError('User not found', 404);

  const list = await prisma.contactList.create({
    data: { ownerUserId, name: name.trim() },
    include: { members: { include: { contact: { include: { linkedUser: { select: { id: true, name: true, isGuest: true } } } } } } },
  });
  return toListDTO(list);
}

export async function listContactLists(ownerUserId: string): Promise<ContactListDTO[]> {
  const lists = await prisma.contactList.findMany({
    where: { ownerUserId },
    include: {
      members: {
        include: { contact: { include: { linkedUser: { select: { id: true, name: true, isGuest: true } } } } },
        orderBy: { addedAt: 'asc' },
      },
    },
    orderBy: { name: 'asc' },
  });
  return lists.map(toListDTO);
}

export async function renameContactList(
  id: string,
  ownerUserId: string,
  name: string,
): Promise<ContactListDTO> {
  const list = await prisma.contactList.findUnique({ where: { id } });
  if (!list) throw new AppError('Contact list not found', 404);
  if (list.ownerUserId !== ownerUserId) throw new AppError('Forbidden', 403);

  const updated = await prisma.contactList.update({
    where: { id },
    data: { name: name.trim() },
    include: { members: { include: { contact: { include: { linkedUser: { select: { id: true, name: true, isGuest: true } } } } } } },
  });
  return toListDTO(updated);
}

export async function deleteContactList(id: string, ownerUserId: string): Promise<void> {
  const list = await prisma.contactList.findUnique({ where: { id } });
  if (!list) throw new AppError('Contact list not found', 404);
  if (list.ownerUserId !== ownerUserId) throw new AppError('Forbidden', 403);
  await prisma.contactList.delete({ where: { id } });
}

export async function addMemberToList(
  listId: string,
  contactId: string,
  ownerUserId: string,
): Promise<ContactListDTO> {
  const [list, contact] = await Promise.all([
    prisma.contactList.findUnique({ where: { id: listId } }),
    prisma.contact.findUnique({ where: { id: contactId } }),
  ]);
  if (!list) throw new AppError('Contact list not found', 404);
  if (list.ownerUserId !== ownerUserId) throw new AppError('Forbidden', 403);
  if (!contact || contact.ownerUserId !== ownerUserId) throw new AppError('Contact not found', 404);

  await prisma.contactListMember.upsert({
    where: { contactListId_contactId: { contactListId: listId, contactId } },
    create: { contactListId: listId, contactId },
    update: {},
  });

  return listContactListById(listId);
}

export async function removeMemberFromList(
  listId: string,
  contactId: string,
  ownerUserId: string,
): Promise<void> {
  const list = await prisma.contactList.findUnique({ where: { id: listId } });
  if (!list) throw new AppError('Contact list not found', 404);
  if (list.ownerUserId !== ownerUserId) throw new AppError('Forbidden', 403);

  await prisma.contactListMember.deleteMany({
    where: { contactListId: listId, contactId },
  });
}

async function listContactListById(id: string): Promise<ContactListDTO> {
  const list = await prisma.contactList.findUnique({
    where: { id },
    include: {
      members: {
        include: { contact: { include: { linkedUser: { select: { id: true, name: true, isGuest: true } } } } },
        orderBy: { addedAt: 'asc' },
      },
    },
  });
  if (!list) throw new AppError('Contact list not found', 404);
  return toListDTO(list);
}

function toListDTO(list: any): ContactListDTO {
  return {
    id: list.id,
    ownerUserId: list.ownerUserId,
    name: list.name,
    createdAt: list.createdAt.toISOString(),
    members: list.members.map((m: any) => toContactDTO(m.contact)),
  };
}
