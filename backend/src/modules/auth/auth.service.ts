// auth.service.ts – Signup, login, JWT verification

import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { prisma } from '../../prisma';
import { AppError } from '../../shared/errors/AppError';
import type { SignupInput, LoginInput, AuthResponse } from './auth.types';
import { resolveLocale } from '../../lib/whatsapp-messages';
import { logServerEvent } from '../analytics/analytics.service';
import { findUserByNormalizedPhone, mergeGuestIntoUser } from '../users/users.service';
import { normalizePhoneToCanonical } from '../../shared/utils/phone.utils';
import { sendPasswordResetEmail } from '../../shared/services/email.service';

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-in-production';
const SALT_ROUNDS = 10;

/**
 * Sign up a new user with email and password.
 * Creates a non-guest user with hashed password.
 */
export async function signup(input: SignupInput): Promise<AuthResponse> {
  const { name, email, password, locale, phone } = input;
  const trimmedEmail = email.trim().toLowerCase();
  const trimmedPassword = password.trim();
  if (!trimmedEmail || !trimmedPassword || trimmedPassword.length < 6) {
    throw new AppError('Email and password (min 6 characters) are required', 400);
  }
  const existing = await prisma.user.findUnique({ where: { email: trimmedEmail } });
  if (existing) {
    throw new AppError('An account with this email already exists', 409);
  }
  const passwordHash = bcrypt.hashSync(trimmedPassword, SALT_ROUNDS);
  const user = await prisma.user.create({
    data: {
      name: name?.trim() || null,
      email: trimmedEmail,
      passwordHash,
      isGuest: false,
      locale: resolveLocale(locale),
    },
  });

  // If a phone was provided at signup, merge any ghost guest and set the phone immediately —
  // this lets users who were previously invited see their match history right away.
  let resolvedPhone: string | undefined;
  if (phone?.trim()) {
    const canonical = normalizePhoneToCanonical(phone.trim());
    resolvedPhone = canonical ?? phone.trim();
    const ghost = await findUserByNormalizedPhone(phone.trim());
    if (ghost && ghost.isGuest) {
      await mergeGuestIntoUser(ghost.id, user.id);
    }
    await prisma.user.update({ where: { id: user.id }, data: { phone: resolvedPhone } });
  }

  const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: '7d' });
  void logServerEvent(user.id, 'auth.signup');
  return {
    user: { id: user.id, name: user.name ?? undefined, email: user.email ?? undefined, phone: resolvedPhone, isGuest: false, onboardingCompleted: user.onboardingCompleted },
    token,
  };
}

/**
 * Log in with email and password.
 */
export async function login(input: LoginInput): Promise<AuthResponse> {
  const { email, password } = input;
  const trimmedEmail = email.trim().toLowerCase();
  const trimmedPassword = password.trim();
  const user = await prisma.user.findUnique({ where: { email: trimmedEmail } });
  if (!user) {
    throw new AppError('Invalid email or password', 401);
  }
  if (!user.passwordHash) {
    throw new AppError('This account has no password. Try signing in as guest or use another method.', 401);
  }
  const valid = bcrypt.compareSync(trimmedPassword, user.passwordHash);
  if (!valid) {
    throw new AppError('Invalid email or password', 401);
  }
  const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: '7d' });
  void logServerEvent(user.id, 'auth.login');
  return {
    user: { id: user.id, name: user.name ?? undefined, email: user.email ?? undefined, isGuest: user.isGuest, onboardingCompleted: user.onboardingCompleted },
    token,
  };
}

/**
 * Send a password-reset email. Always returns successfully to avoid user enumeration.
 */
export async function forgotPassword(email: string): Promise<void> {
  const trimmedEmail = email.trim().toLowerCase();
  const user = await prisma.user.findUnique({ where: { email: trimmedEmail } });
  if (!user) return; // silent — don't reveal whether the email exists

  console.log(`[auth] password reset requested for user ${user.id} (${trimmedEmail})`);

  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

  await prisma.user.update({
    where: { id: user.id },
    data: { resetPasswordToken: token, resetPasswordTokenExpiresAt: expiresAt },
  });

  const frontendBaseUrl = process.env.FRONTEND_BASE_URL || 'http://localhost:5173';
  const resetUrl = `${frontendBaseUrl}/#/reset-password?token=${token}`;
  const locale = user.locale ?? 'es';

  await sendPasswordResetEmail(trimmedEmail, resetUrl, locale);
}

/**
 * Reset the password using a valid token.
 */
export async function resetPassword(token: string, newPassword: string): Promise<void> {
  if (!token || !newPassword || newPassword.length < 6) {
    throw new AppError('Token and a password of at least 6 characters are required', 400);
  }

  const user = await prisma.user.findUnique({ where: { resetPasswordToken: token } });
  if (!user || !user.resetPasswordTokenExpiresAt || user.resetPasswordTokenExpiresAt < new Date()) {
    throw new AppError('Invalid or expired password reset link', 400, 'INVALID_RESET_TOKEN');
  }

  const passwordHash = bcrypt.hashSync(newPassword.trim(), SALT_ROUNDS);
  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash, resetPasswordToken: null, resetPasswordTokenExpiresAt: null },
  });
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
