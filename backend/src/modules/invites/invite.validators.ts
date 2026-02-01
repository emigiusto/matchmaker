// invite.validators.ts
// --------------------
// Zod schemas for Invite module

import { z } from 'zod';

/**
 * Confirmation is link-based:
 * - Invite confirmation/decline is performed via a unique token in the link.
 * - No userId is accepted or required during confirmation.
 * - WhatsApp replies are ignored; only link clicks are valid.
 */

/**
 * Schema for creating an invite
 */
export const createInviteSchema = z.object({
  availabilityId: z.string().uuid(),
  inviterUserId: z.string().uuid(),
  // Additional fields can be added as needed
});

/**
 * Schema for invite token param (e.g., in route params or query)
 * - Token must be a non-empty string
 */
export const inviteTokenParamSchema = z.object({
  token: z.string().min(1, 'Token is required'),
});

/**
 * Schema for confirming an invite (empty body, token-only)
 */
export const confirmInviteSchema = z.object({});

/**
 * Schema for declining an invite (empty body, token-only)
 */
export const declineInviteSchema = z.object({});
