// matches.service.ts
// Read-only service for Match entities.
// Matches are derived and immutable: they are only created via Invite confirmation (see Invites module) and never modified directly.
// No creation or mutation logic here. No WhatsApp or external messaging logic.
// Guest fallback: playerA/playerB may be null for guest users or incomplete data.
import { prisma } from '../../shared/prisma';
import { MatchDTO } from './matches.types';
import { AppError } from '../../shared/errors/AppError';
import { Match as PrismaMatch } from '@prisma/client';

/**
 * Fetch a match by its ID. Throws AppError if not found.
 * Invariant: A Match always has a valid Invite and Availability.
 */
export async function getMatchById(matchId: string): Promise<MatchDTO> {
  // Defensive: Always fetch related Invite and Availability to ensure invariants
  const match = await prisma.match.findUnique({
    where: { id: matchId },
    include: {
      invite: true,
      availability: true,
    },
  });
  if (!match) throw new AppError('Match not found', 404);
  if (!match.invite) throw new AppError('Invariant violation: Match missing Invite', 500);
  if (!match.availability) throw new AppError('Invariant violation: Match missing Availability', 500);
  return toMatchDTO(match);
}

/**
 * List all matches for a given user (read-only).
 * Returns matches where:
 *   - user is the inviter (Invite.inviterId)
 *   - user owns the Availability (Availability.userId)
 *   - user has a Player participating (Player.userId)
 * No creation or mutation logic. Naming and logic consistent with Invites module.
 */
export async function listMatchesForUser(userId: string): Promise<MatchDTO[]> {
  // Defensive: Try to resolve Player for this user
  const player = await prisma.player.findUnique({ where: { userId } });

  // Build query conditions
  const orConditions: any[] = [
    { invite: { inviterId: userId } },
    { availability: { userId } },
  ];
  if (player) {
    // If user has a Player, include matches where they participate as playerA or playerB
    orConditions.push({ playerAId: player.id });
    orConditions.push({ playerBId: player.id });
  }

  // Defensive: Always fetch related Invite and Availability, sort, and deduplicate
  const matches = await prisma.match.findMany({
    where: {
      OR: orConditions,
    },
    include: {
      invite: true,
      availability: true,
    },
    orderBy: { scheduledAt: 'desc' },
  });
  // Deduplicate by match.id (in case of overlapping conditions)
  const uniqueMatches = Array.from(new Map(matches.map(m => [m.id, m])).values());
  // Defensive: filter out any matches missing required relations
  return uniqueMatches.filter(m => m.invite && m.availability).map(toMatchDTO);
}

/**
 * List all matches for a given player (read-only).
 * Returns matches where playerId is playerA or playerB.
 * No creation or mutation logic. Naming and logic consistent with Invites module.
 */
export async function listMatchesForPlayer(playerId: string): Promise<MatchDTO[]> {
  // Defensive: Always fetch related Invite and Availability, sort, and deduplicate
  const matches = await prisma.match.findMany({
    where: {
      OR: [
        { playerAId: playerId },
        { playerBId: playerId },
      ],
    },
    include: {
      invite: true,
      availability: true,
    },
    orderBy: { scheduledAt: 'desc' },
  });
  // Deduplicate by match.id (should not be needed, but defensive)
  const uniqueMatches = Array.from(new Map(matches.map(m => [m.id, m])).values());
  // Defensive: filter out any matches missing required relations
  return uniqueMatches.filter(m => m.invite && m.availability).map(toMatchDTO);
}

// Helper: convert DB Match to API MatchDTO
// Defensive: expects match.invite and match.availability to be present
function toMatchDTO(match: PrismaMatch): MatchDTO {
  return {
    id: match.id,
    inviteId: match.inviteId,
    availabilityId: match.availabilityId,
    venueId: match.venueId,
    playerAId: match.playerAId,
    playerBId: match.playerBId,
    scheduledAt: match.scheduledAt instanceof Date ? match.scheduledAt.toISOString() : String(match.scheduledAt),
    createdAt: match.createdAt instanceof Date ? match.createdAt.toISOString() : String(match.createdAt),
  };
}
