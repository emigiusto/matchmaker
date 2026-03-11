// guest-contacts.service.ts
// Service for manual contacts (name + phone)
// Used in I Want to Play flow; later migrated to native app phone contacts
// Creates GuestContact (owner's address book) and finds/creates User (for scheduling)

import { AppError } from '../../shared/errors/AppError';
import { prisma } from '../../prisma';
import {
  CreateGuestContactInput,
  CreateGuestContactResultDTO,
  EnsureUserByPhoneResultDTO,
  GuestContactDTO,
} from './guest-contacts.types';

export async function createGuestContact(input: CreateGuestContactInput): Promise<CreateGuestContactResultDTO> {
  const owner = await prisma.user.findUnique({ where: { id: input.ownerUserId } });
  if (!owner) throw new AppError('User not found', 404);

  const name = input.name.trim();
  const phone = input.phone.trim();

  const guestContact = await prisma.guestContact.create({
    data: {
      ownerUserId: input.ownerUserId,
      name,
      phone,
    },
  });

  let user = await prisma.user.findUnique({ where: { phone } });
  if (!user) {
    user = await prisma.user.create({
      data: { name, phone, isGuest: true },
    });
  }

  return {
    guestContact: {
      id: guestContact.id,
      ownerUserId: guestContact.ownerUserId,
      name: guestContact.name,
      phone: guestContact.phone,
      createdAt: guestContact.createdAt.toISOString(),
    },
    user: { id: user.id, name: user.name },
  };
}

/**
 * Find or create User by phone. Used when adding an existing GuestContact to invite list.
 */
export async function ensureUserByPhone(phone: string, name: string): Promise<EnsureUserByPhoneResultDTO> {
  const trimmedPhone = phone.trim();
  const trimmedName = name.trim();
  let user = await prisma.user.findUnique({ where: { phone: trimmedPhone } });
  if (!user) {
    user = await prisma.user.create({
      data: { name: trimmedName, phone: trimmedPhone, isGuest: true },
    });
  }
  return { user: { id: user.id, name: user.name } };
}

export async function listGuestContactsByOwner(ownerUserId: string): Promise<GuestContactDTO[]> {
  const contacts = await prisma.guestContact.findMany({
    where: { ownerUserId },
    orderBy: { createdAt: 'desc' },
  });
  return contacts.map((c) => ({
    id: c.id,
    ownerUserId: c.ownerUserId,
    name: c.name,
    phone: c.phone,
    createdAt: c.createdAt.toISOString(),
  }));
}
