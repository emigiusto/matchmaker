// invite.token.ts
// ---------------
// Utilities for generating and validating invite tokens (SECURITY CRITICAL)

import crypto from 'crypto';

/**
 * Security considerations:
 * - Tokens are cryptographically secure, random, and URL-safe.
 * - No information is encoded in the token (opaque).
 * - Never accept or parse external token input for security.
 * - Expiration is enforced (default: 72 hours).
 */

const TOKEN_BYTE_LENGTH = 32; // 256 bits
const INVITE_EXPIRATION_HOURS = 72;

/**
 * Generate a cryptographically secure, URL-safe invite token.
 * - Token is opaque and contains no embedded information.
 */
export function generateInviteToken(): string {
  // Generate random bytes and encode as base64url (RFC 4648, no padding)
  return crypto.randomBytes(TOKEN_BYTE_LENGTH).toString('base64url');
}

/**
 * Get invite expiration date (default: 72 hours from now)
 */
export function getInviteExpiration(): Date {
  const expires = new Date();
  expires.setHours(expires.getHours() + INVITE_EXPIRATION_HOURS);
  return expires;
}

/**
 * Check if an invite is expired
 */
export function isInviteExpired(expiresAt: Date): boolean {
  return new Date() > expiresAt;
}
