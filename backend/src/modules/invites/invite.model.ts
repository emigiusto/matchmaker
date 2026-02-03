// invite.model.ts
// ---------------
// Centralized helpers for Invite domain logic (pure functions, no DB access)

import { InviteDTO, InviteStatus } from './invite.types';

/**
 * Domain rules:
 * - Only pending invites can be confirmed or declined.
 * - Status transitions are explicit and enforced at the service layer.
 * - This file avoids leaking Prisma logic throughout the codebase.
 *
 * Additional endpoints for richer UI/admin support:
 * - GET /invites/by-id/:id: Get invite by ID
 * - GET /invites/by-user/:userId: List all invites sent or received by a user
 * - GET /invites/by-availability/:availabilityId: List all invites for an availability
 * - GET /invites/count/:userId: Count invites for a user
 */

/**
 * Returns true if the invite is pending.
 */
export function isPending(invite: Pick<InviteDTO, 'status'>): boolean {
  return invite.status === 'pending';
}

/**
 * Returns true if the invite can be confirmed (pending only).
 */
export function canBeConfirmed(invite: Pick<InviteDTO, 'status'>): boolean {
  return invite.status === 'pending';
}

/**
 * Returns true if the invite can be declined (pending only).
 */
export function canBeDeclined(invite: Pick<InviteDTO, 'status'>): boolean {
  return invite.status === 'pending';
}
