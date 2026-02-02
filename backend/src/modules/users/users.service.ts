// users.service.ts
// All business logic here. Throws AppError on error.
// Guest-first: users may exist forever as guests.

import { prisma } from '../../shared/prisma';
import { AppError } from '../../shared/errors/AppError';
import { User } from './users.types';

/**
 * Retrieve all users from the database.
 * @returns Array of User objects
 */
export async function findAllUsers(): Promise<User[]> {
  const users = await prisma.user.findMany();
  return users.map(user => ({
    ...user,
    name: user.name ?? undefined,
    phone: user.phone ?? undefined,
    createdAt: user.createdAt.toISOString(),
    updatedAt: user.updatedAt.toISOString(),
  }));
}

/**
 * Find a user by their unique ID.
 * @param id User ID
 * @returns User object
 * @throws AppError if user not found
 */
export async function findUserById(id: string): Promise<User> {
  const user = await prisma.user.findUnique({ where: { id } });
  if (!user) throw new AppError('User not found', 404);
  return {
    ...user,
    name: user.name ?? undefined,
    phone: user.phone ?? undefined,
    createdAt: user.createdAt.toISOString(),
    updatedAt: user.updatedAt.toISOString(),
  };
}

/**
 * Find a user by their phone number.
 * @param phone User phone number
 * @returns User object
 * @throws AppError if user not found
 */
export async function findUserByPhone(phone: string): Promise<User> {
  const user = await prisma.user.findUnique({ where: { phone } });
  if (!user) throw new AppError('User not found', 404);
  return {
    ...user,
    name: user.name ?? undefined,
    phone: user.phone ?? undefined,
    createdAt: user.createdAt.toISOString(),
    updatedAt: user.updatedAt.toISOString(),
  };
}

/**
 * Create a new non-guest user.
 * @param name User name
 * @param phone Optional phone number
 * @returns Created User object
 * @throws AppError if phone already exists or creation fails
 */
export async function createUser(name: string, phone?: string): Promise<User> {
  try {
    const user = await prisma.user.create({
      data: {
        name,
        phone,
        isGuest: false,
      },
    });
    return {
      ...user,
      name: user.name ?? undefined,
      phone: user.phone ?? undefined,
      createdAt: user.createdAt.toISOString(),
      updatedAt: user.updatedAt.toISOString(),
    };
  } catch (err: any) {
    if (err.code === 'P2002') {
      throw new AppError('Phone already exists', 409);
    }
    throw new AppError('Failed to create user', 500);
  }
}

/**
 * Create a new guest user. Phone is optional.
 * @param name Optional user name
 * @param phone Optional phone number
 * @returns Created guest User object
 * @throws AppError if phone already exists or creation fails
 */
export async function createGuestUser(name?: string, phone?: string): Promise<User> {
  try {
    const user = await prisma.user.create({
      data: {
        name,
        phone,
        isGuest: true,
      },
    });
    return {
      ...user,
      name: user.name ?? undefined,
      phone: user.phone ?? undefined,
      createdAt: user.createdAt.toISOString(),
      updatedAt: user.updatedAt.toISOString(),
    };
  } catch (err: any) {
    if (err.code === 'P2002') {
      throw new AppError('Phone already exists', 409);
    }
    throw new AppError('Failed to create guest user', 500);
  }
}

/**
 * Update an existing user by ID.
 * @param id User ID
 * @param name Optional new name
 * @param phone Optional new phone number
 * @returns Updated User object
 * @throws AppError if user not found, phone exists, or update fails
 */
export async function updateUser(id: string, name?: string, phone?: string): Promise<User> {
  try {
    const user = await prisma.user.update({
      where: { id },
      data: { name, phone },
    });
    return {
      ...user,
      name: user.name ?? undefined,
      phone: user.phone ?? undefined,
      createdAt: user.createdAt.toISOString(),
      updatedAt: user.updatedAt.toISOString(),
    };
  } catch (err: any) {
    if (err.code === 'P2025') {
      throw new AppError('User not found', 404);
    }
    if (err.code === 'P2002') {
      throw new AppError('Phone already exists', 409);
    }
    throw new AppError('Failed to update user', 500);
  }
}

/**
 * Delete a user by ID.
 * @param id User ID
 * @throws AppError if user not found or deletion fails
 */
export async function deleteUser(id: string): Promise<void> {
  try {
    await prisma.user.delete({ where: { id } });
  } catch (err: any) {
    if (err.code === 'P2025') {
      throw new AppError('User not found', 404);
    }
    throw new AppError('Failed to delete user', 500);
  }
}
