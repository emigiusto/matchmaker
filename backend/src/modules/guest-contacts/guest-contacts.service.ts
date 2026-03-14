// guest-contacts.service.ts
// Service for manual contacts (name + phone)
// Used in I Want to Play flow; later migrated to native app phone contacts
// Creates GuestContact (owner's address book) and finds/creates User (for scheduling)
// Phone normalization: one phone (any format) = one userId. Enables future account unification.

import { AppError } from '../../shared/errors/AppError';
import { normalizePhoneToCanonical } from '../../shared/utils/phone.utils';
import { findUserByNormalizedPhone } from '../users/users.service';
import { prisma } from '../../prisma';
import {
  CreateGuestContactInput,
  CreateGuestContactResultDTO,
  EnsureUserByPhoneResultDTO,
  GuestContactDTO,
} from './guest-contacts.types';

/** Canonical format for storage - E.164-like with + prefix for consistency */
function toStoredPhone(phone: string): string {
  const canonical = normalizePhoneToCanonical(phone);
  return canonical ? `+${canonical}` : phone.trim();
}

export async function createGuestContact(input: CreateGuestContactInput): Promise<CreateGuestContactResultDTO> {
  const owner = await prisma.user.findUnique({ where: { id: input.ownerUserId } });
  if (!owner) throw new AppError('User not found', 404);

  const name = input.name.trim();
  const phoneInput = input.phone.trim();
  const storedPhone = toStoredPhone(phoneInput);

  const guestContact = await prisma.guestContact.create({
    data: {
      ownerUserId: input.ownerUserId,
      name,
      phone: phoneInput,
      ...(input.socioNumber !== undefined && { socioNumber: input.socioNumber }),
    },
  });

  let user: { id: string; name: string | null };
  const existingUser = await findUserByNormalizedPhone(phoneInput);
  if (existingUser) {
    user = { id: existingUser.id, name: existingUser.name ?? null };
  } else {
    const created = await prisma.user.create({
      data: { name, phone: storedPhone, isGuest: true },
    });
    user = { id: created.id, name: created.name ?? null };
  }

  return {
    guestContact: {
      id: guestContact.id,
      ownerUserId: guestContact.ownerUserId,
      name: guestContact.name,
      phone: guestContact.phone,
      ...(guestContact.socioNumber !== null && guestContact.socioNumber !== undefined && { socioNumber: guestContact.socioNumber }),
      createdAt: guestContact.createdAt.toISOString(),
    },
    user: { id: user.id, name: user.name },
  };
}

/**
 * Find or create User by phone. Used when adding candidates.
 * Normalized lookup: "34600972124" and "+34 600 972 124" resolve to the same user.
 * Stores canonical format for new users. Enables future unification when guest creates account.
 */
export async function ensureUserByPhone(phone: string, name: string): Promise<EnsureUserByPhoneResultDTO> {
  const trimmedName = name.trim();
  const existing = await findUserByNormalizedPhone(phone);
  if (existing) {
    return { user: { id: existing.id, name: (existing.name ?? trimmedName) || null } };
  }
  const storedPhone = toStoredPhone(phone);
  const created = await prisma.user.create({
    data: { name: trimmedName, phone: storedPhone, isGuest: true },
  });
  return { user: { id: created.id, name: (created.name ?? trimmedName) || null } };
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
    ...(c.socioNumber !== null && c.socioNumber !== undefined && { socioNumber: c.socioNumber }),
    createdAt: c.createdAt.toISOString(),
  }));
}

export async function updateGuestContactSocioNumber(
  id: string,
  ownerUserId: string,
  socioNumber: string,
): Promise<GuestContactDTO> {
  const contact = await prisma.guestContact.findUnique({ where: { id } });
  if (!contact) throw new AppError('Guest contact not found', 404);
  if (contact.ownerUserId !== ownerUserId) throw new AppError('Forbidden', 403);

  const updated = await prisma.guestContact.update({
    where: { id },
    data: { socioNumber },
  });

  return {
    id: updated.id,
    ownerUserId: updated.ownerUserId,
    name: updated.name,
    phone: updated.phone,
    ...(updated.socioNumber !== null && updated.socioNumber !== undefined && { socioNumber: updated.socioNumber }),
    createdAt: updated.createdAt.toISOString(),
  };
}
