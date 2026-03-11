// auth.service.ts – Signup, login, JWT verification

import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { prisma } from '../../prisma';
import { AppError } from '../../shared/errors/AppError';
import type { SignupInput, LoginInput, AuthResponse } from './auth.types';

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-in-production';
const SALT_ROUNDS = 10;

/**
 * Sign up a new user with email and password.
 * Creates a non-guest user with hashed password.
 */
export async function signup(input: SignupInput): Promise<AuthResponse> {
  const { name, email, password } = input;
  const trimmedEmail = email.trim().toLowerCase();
  if (!trimmedEmail || !password || password.length < 6) {
    throw new AppError('Email and password (min 6 characters) are required', 400);
  }
  const existing = await prisma.user.findUnique({ where: { email: trimmedEmail } });
  if (existing) {
    throw new AppError('An account with this email already exists', 409);
  }
  const passwordHash = bcrypt.hashSync(password, SALT_ROUNDS);
  const user = await prisma.user.create({
    data: {
      name: name?.trim() || null,
      email: trimmedEmail,
      passwordHash,
      isGuest: false,
    },
  });
  const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: '7d' });
  return {
    user: { id: user.id, name: user.name ?? undefined, email: user.email ?? undefined, isGuest: user.isGuest },
    token,
  };
}

/**
 * Log in with email and password.
 */
export async function login(input: LoginInput): Promise<AuthResponse> {
  const { email, password } = input;
  const trimmedEmail = email.trim().toLowerCase();
  const user = await prisma.user.findUnique({ where: { email: trimmedEmail } });
  if (!user) {
    throw new AppError('Invalid email or password', 401);
  }
  if (!user.passwordHash) {
    throw new AppError('This account has no password. Try signing in as guest or use another method.', 401);
  }
  const valid = bcrypt.compareSync(password, user.passwordHash);
  if (!valid) {
    throw new AppError('Invalid email or password', 401);
  }
  const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: '7d' });
  return {
    user: { id: user.id, name: user.name ?? undefined, email: user.email ?? undefined, isGuest: user.isGuest },
    token,
  };
}

/**
 * Verify JWT and return payload. Throws if invalid.
 */
export function verifyToken(token: string): { userId: string } {
  try {
    const payload = jwt.verify(token, JWT_SECRET) as { userId?: string };
    if (!payload?.userId) throw new Error('Invalid token payload');
    return { userId: payload.userId };
  } catch {
    throw new AppError('Invalid or expired token', 401);
  }
}
