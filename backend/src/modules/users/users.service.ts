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

export async function createUser(name: string, phone?: string): Promise<User> {
  // Create a non-guest user
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
// users.service.ts
// All business logic here. Throws AppError on error.
// Guest-first: users may exist forever as guests.

import { PrismaClient } from '@prisma/client';
import { AppError } from '../../shared/errors/AppError';
import { User } from './users.types';

const prisma = new PrismaClient();

export async function createGuestUser(name?: string, phone?: string): Promise<User> {
  // Phone is optional. Do not create Player automatically.
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
