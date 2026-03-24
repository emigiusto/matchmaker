// users.service.ts
// All business logic here. Throws AppError on error.
// Guest-first: users may exist forever as guests.
import { cacheGet, cacheSet, cacheDel } from '../../shared/cache/redis';
import { prisma } from '../../prisma';
import { AppError } from '../../shared/errors/AppError';
import { normalizePhoneToCanonical } from '../../shared/utils/phone.utils';
import { UserDTO } from './users.types';
import type { User as PrismaUser } from '@prisma/client';

/**
 * Retrieve all users from the database.
 * @returns Array of UserDTO objects
 */
export async function searchUsers(q: string, limit = 20): Promise<UserDTO[]> {
  const users = await prisma.user.findMany({
    where: {
      isAdmin: false,
      OR: [
        { name: { contains: q } },
        { email: { contains: q } },
        { phone: { contains: q } },
      ],
    },
    select: {
      id: true, name: true, email: true, phone: true,
      isGuest: true, isAdmin: true, onboardingCompleted: true,
      createdAt: true, updatedAt: true,
    },
    orderBy: { name: 'asc' },
    take: limit,
  });
  return users.map(toDTO);
}

export async function findAllUsers(): Promise<UserDTO[]> {
  const users = await prisma.user.findMany({
    select: {
      id: true,
      name: true,
      email: true,
      phone: true,
      isGuest: true,
      isAdmin: true,
      onboardingCompleted: true,
      createdAt: true,
      updatedAt: true,
    },
  });
  return users.map(toDTO);
}

/**
 * Find a user by their unique ID.
 * @param id User ID
 * @returns UserDTO object
 * @throws AppError if user not found
 */
export async function findUserById(id: string): Promise<UserDTO> {
  const user = await prisma.user.findUnique({ where: { id } });
  if (!user) throw new AppError('User not found', 404);
  return toDTO(user);
}

/**
 * Find a user by their phone number (exact match).
 * @param phone User phone number
 * @returns UserDTO object
 * @throws AppError if user not found
 */
export async function findUserByPhone(phone: string): Promise<UserDTO> {
  const user = await prisma.user.findUnique({ where: { phone } });
  if (!user) throw new AppError('User not found', 404);
  return toDTO(user);
}

/**
 * Find a user by phone using normalized digits. Handles multiple formats
 * (e.g. "34600972124", "+34 600 972 124") mapping to the same user.
 * Used when adding candidates to ensure one phone = one userId.
 * @param phone Phone in any format
 * @returns UserDTO or null if not found
 */
export async function findUserByNormalizedPhone(phone: string): Promise<UserDTO | null> {
  const canonical = normalizePhoneToCanonical(phone);
  if (!canonical) return null;
  const users = await prisma.user.findMany({ where: { phone: { not: null } } });
  const match = users.find((u) => u.phone && normalizePhoneToCanonical(u.phone) === canonical);
  return match ? toDTO(match) : null;
}

/**
 * Create a new non-guest user.
 * @param name User name
 * @param email Optional email
 * @param phone Optional phone number
 * @returns Created UserDTO object
 * @throws AppError if phone or email already exists or creation fails
 */
export async function createUser(name: string, email?: string, phone?: string): Promise<UserDTO> {
  try {
    const user = await prisma.user.create({
      data: {
        name,
        email,
        phone,
        isGuest: false,
      },
    });
    return toDTO(user);
  } catch (err: unknown) {
    if (typeof err === 'object' && err !== null && 'code' in err && (err as { code?: string }).code === 'P2002') {
      throw new AppError('Phone or email already exists', 409);
    }
    throw new AppError('Failed to create user', 500);
  }
}

/**
 * Create a new guest user. Phone and email are optional.
 * @param name Optional user name
 * @param email Optional email
 * @param phone Optional phone number
 * @returns Created guest UserDTO object
 * @throws AppError if phone or email already exists or creation fails
 */
export async function createGuestUser(name?: string, email?: string, phone?: string): Promise<UserDTO> {
  try {
    const user = await prisma.user.create({
      data: {
        name,
        email,
        phone,
        isGuest: true,
      },
    });
    return toDTO(user);
  } catch (err: unknown) {
    if (typeof err === 'object' && err !== null && 'code' in err && (err as { code?: string }).code === 'P2002') {
      throw new AppError('Phone or email already exists', 409);
    }
    throw new AppError('Failed to create guest user', 500);
  }
}

/**
 * Update an existing user by ID.
 * Email is not updatable (managed by auth provider).
 * If a phone is being set, any existing guest user with that phone is merged
 * into this user first (preserving their match history).
 * @param id User ID
 * @param name Optional new name
 * @param phone Optional new phone number
 * @returns Updated UserDTO object
 * @throws AppError if user not found, phone/email exists, or update fails
 */
export async function updateUser(id: string, name?: string, phone?: string | null): Promise<UserDTO> {
  // When a phone is being claimed, check for a ghost guest user with that number
  // and absorb their history into this account before setting the phone.
  if (phone) {
    const ghost = await findUserByNormalizedPhone(phone);
    if (ghost && ghost.id !== id && ghost.isGuest) {
      await mergeGuestIntoUser(ghost.id, id);
    }
  }

  try {
    const data: { name?: string; phone?: string | null } = {};
    if (name !== undefined) data.name = name;
    if (phone !== undefined) data.phone = phone;
    await cacheDel(`userdto:${id}`);
    const user = await prisma.user.update({
      where: { id },
      data,
    });
    return toDTO(user);
  } catch (err: unknown) {
    if (typeof err === 'object' && err !== null && 'code' in err) {
      if ((err as { code?: string }).code === 'P2025') {
        throw new AppError('User not found', 404);
      }
      if ((err as { code?: string }).code === 'P2002') {
        throw new AppError('Phone number already in use', 409);
      }
    }
    throw new AppError('Failed to update user', 500);
  }
}

/**
 * Merge a guest user's history into a real user, then delete the ghost.
 * Transfers: MatchParticipants, SchedulingCandidates, Contact links,
 * UserEvents, Notifications, Reminders, Messages, ClubMemberships,
 * Results, Availabilities, SchedulingRequests, Player (if target has none).
 */
export async function mergeGuestIntoUser(guestId: string, targetId: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    // ── MatchParticipant ─────────────────────────────────────────────
    // Drop duplicates where target is already a participant in the same match
    const targetMatchIds = (
      await tx.matchParticipant.findMany({ where: { userId: targetId }, select: { matchId: true } })
    ).map((p) => p.matchId);
    if (targetMatchIds.length > 0) {
      await tx.matchParticipant.deleteMany({ where: { userId: guestId, matchId: { in: targetMatchIds } } });
    }
    await tx.matchParticipant.updateMany({ where: { userId: guestId }, data: { userId: targetId } });

    // ── SchedulingCandidate ──────────────────────────────────────────
    await tx.schedulingCandidate.updateMany({ where: { contactUserId: guestId }, data: { contactUserId: targetId } });

    // ── SchedulingRequest (host / host partner) ──────────────────────
    await tx.schedulingRequest.updateMany({ where: { hostUserId: guestId }, data: { hostUserId: targetId } });
    await tx.schedulingRequest.updateMany({ where: { hostPartnerUserId: guestId }, data: { hostPartnerUserId: targetId } });

    // ── Contact.linkedUserId ─────────────────────────────────────────
    await tx.contact.updateMany({ where: { linkedUserId: guestId }, data: { linkedUserId: targetId } });

    // ── Contact / ContactList owned by guest ─────────────────────────
    await tx.contact.updateMany({ where: { ownerUserId: guestId }, data: { ownerUserId: targetId } });
    await tx.contactList.updateMany({ where: { ownerUserId: guestId }, data: { ownerUserId: targetId } });

    // ── UserEvent ────────────────────────────────────────────────────
    await tx.userEvent.updateMany({ where: { userId: guestId }, data: { userId: targetId } });

    // ── Notification ─────────────────────────────────────────────────
    await tx.notification.updateMany({ where: { userId: guestId }, data: { userId: targetId } });

    // ── Reminder ─────────────────────────────────────────────────────
    await tx.reminder.updateMany({ where: { userId: guestId }, data: { userId: targetId } });

    // ── Message ──────────────────────────────────────────────────────
    await tx.message.updateMany({ where: { senderUserId: guestId }, data: { senderUserId: targetId } });

    // ── Availability ─────────────────────────────────────────────────
    await tx.availability.updateMany({ where: { userId: guestId }, data: { userId: targetId } });

    // ── Result (winner) ──────────────────────────────────────────────
    await tx.result.updateMany({ where: { winnerUserId: guestId }, data: { winnerUserId: targetId } });

    // ── ClubMembership — skip clubs where target already has one ─────
    const targetClubs = (
      await tx.clubMembership.findMany({ where: { userId: targetId }, select: { clubSlug: true } })
    ).map((m) => m.clubSlug);
    if (targetClubs.length > 0) {
      await tx.clubMembership.deleteMany({ where: { userId: guestId, clubSlug: { in: targetClubs } } });
    }
    await tx.clubMembership.updateMany({ where: { userId: guestId }, data: { userId: targetId } });

    // ── Player — move only if target has none ────────────────────────
    const targetPlayer = await tx.player.findUnique({ where: { userId: targetId } });
    const guestPlayer = await tx.player.findUnique({ where: { userId: guestId } });
    if (guestPlayer) {
      if (!targetPlayer) {
        await tx.player.update({ where: { id: guestPlayer.id }, data: { userId: targetId } });
      } else {
        // Guest's player record is empty (no real data) — just drop it
        await tx.playerSurface.deleteMany({ where: { playerId: guestPlayer.id } });
        await tx.player.delete({ where: { id: guestPlayer.id } });
      }
    }

    // ── Delete the ghost ─────────────────────────────────────────────
    await tx.user.delete({ where: { id: guestId } });
  });
}

/**
 * Delete a user by ID.
 * @param id User ID
 * @throws AppError if user not found or deletion fails
 */
export async function deleteUser(id: string): Promise<void> {
  try {
    await prisma.user.delete({ where: { id } });
  } catch (err: unknown) {
    if (typeof err === 'object' && err !== null && 'code' in err && (err as { code?: string }).code === 'P2025') {
      throw new AppError('User not found', 404);
    }
    throw new AppError('Failed to delete user', 500);
  }
}

/**
 * Find a user by their unique ID, using a cache if provided.
 * @param id User ID
 * @param cache Optional Map<string, UserDTO> for local caching
 * @returns UserDTO object
 * @throws AppError if user not found
 */
export async function findUserByIdCached(id: string): Promise<UserDTO> {
  const cacheKey = `userdto:${id}`;
  try {
    const cached = await cacheGet(cacheKey);
    if (cached) {
      return JSON.parse(cached);
    }
  } catch (err) {
    // Ignore cache errors, fallback to DB
  }
  const user = await prisma.user.findUnique({ where: { id } });
  if (!user) throw new AppError('User not found', 404);
  const dto = toDTO(user);
  try {
    await cacheSet(cacheKey, JSON.stringify(dto), 60 * 60 * 24); // cache for 24 hours
  } catch (err) {
    // Ignore cache set errors
  }
  return dto;
}

/**
 * Fetch UserDTOs for a list of user IDs using findUserByIdCached.
 * @param userIds Array of user IDs
 * @returns Array of UserDTOs
 */
export async function findUsersByIdsCached(userIds: string[]): Promise<UserDTO[]> {
  const result: UserDTO[] = [];
  for (const id of userIds) {
    try {
      const dto = await findUserByIdCached(id);
      result.push(dto);
    } catch (err) {
      // Optionally skip or handle missing users
    }
  }
  return result;
}

/**
 * Find profile (user + player) by user ID. Single source for profile view.
 * Player is null if user has no Player.
 */
export async function findProfileByUserId(userId: string): Promise<{
  user: UserDTO;
  player: { id: string; defaultCity?: string; preferredClub?: string } | null;
}> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new AppError('User not found', 404);

  const player = await prisma.player.findUnique({
    where: { userId },
    include: { preferredSurfaces: { select: { surface: true } } },
  });

  return {
    user: toDTO(user),
    player: player
      ? {
          id: player.id,
          defaultCity: player.defaultCity ?? undefined,
          preferredClub: (player as { preferredClub?: string }).preferredClub ?? undefined,
        }
      : null,
  };
}

/**
 * Mark onboarding as completed for a user.
 * Requires the user to have a phone number set — phone is the unifying
 * identifier that links signup accounts to prior match history.
 */
export async function completeOnboarding(userId: string): Promise<void> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { phone: true } });
  if (!user) throw new AppError('User not found', 404);
  if (!user.phone) throw new AppError('A phone number is required to complete onboarding', 400);
  await prisma.user.update({
    where: { id: userId },
    data: { onboardingCompleted: true },
  });
  await cacheDel(`userdto:${userId}`);
}

/**
 * Convert Prisma user object to API UserDTO type
 */
function toDTO(user: Pick<PrismaUser, 'id' | 'name' | 'email' | 'phone' | 'isGuest' | 'isAdmin' | 'onboardingCompleted' | 'createdAt' | 'updatedAt'>): UserDTO {
  return {
    id: user.id,
    name: user.name ?? undefined,
    email: user.email ?? undefined,
    phone: user.phone ?? undefined,
    isGuest: user.isGuest,
    isAdmin: user.isAdmin,
    onboardingCompleted: user.onboardingCompleted,
    createdAt: user.createdAt.toISOString(),
    updatedAt: user.updatedAt.toISOString(),
  };
}