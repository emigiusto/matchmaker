// availability.service.ts
// ----------------------
// Core logic for Availability management
//
// This module manages availabilities for Users (not Players).
//
// - Each Availability belongs to exactly one User (user-scoped, not player-scoped).
// - No overlap detection yet (handled in future logic).
// - No Invite or Matchmaking logic here.
// - No Player references anywhere in this module.
//
// Future: Overlap detection, Player-based availability, and integration with invites/matchmaking.

import { PrismaClient } from '@prisma/client';
import { AppError } from '../../shared/errors/AppError';
import { AvailabilityDTO, CreateAvailabilityInput } from './availability.types';
import { Availability as PrismaAvailability } from '@prisma/client';
import { AcceptAvailabilityResult } from '../../shared/types';

const prisma = new PrismaClient();

export class AvailabilityService {
  /**
   * Create an availability slot for a User
   * - Validates User existence
   * - No overlap detection yet
   */
  static async createAvailability(userId: string, data: CreateAvailabilityInput): Promise<AvailabilityDTO> {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new AppError('User not found', 404);
    // Future: Overlap detection will be added here
    const availability = await prisma.availability.create({
      data: {
        userId,
        date: data.date,
        startTime: data.startTime,
        endTime: data.endTime,
        locationText: data.locationText,
        minLevel: data.minLevel ?? null,
        maxLevel: data.maxLevel ?? null,
        preferredSurface: data.preferredSurface ?? null,
        status: data.status ?? 'open',
      },
    });
    return AvailabilityService.toDTO(availability);
  }

  /**
   * Get a single availability by ID
   */
  static async getAvailabilityById(availabilityId: string): Promise<AvailabilityDTO | null> {
    const availability = await prisma.availability.findUnique({ where: { id: availabilityId } });
    if (!availability) return null;
    return AvailabilityService.toDTO(availability);
  }

  /**
   * List availabilities by date (optionally filtered by userId)
   */
  static async listAvailabilitiesByDate(date: string, userId?: string): Promise<AvailabilityDTO[]> {
    const where: { date: string; userId?: string } = { date };
    if (userId) where.userId = userId;
    const availabilities = await prisma.availability.findMany({ where });
    return availabilities.map(AvailabilityService.toDTO);
  }

  /**
   * Count availabilities for a user
   */
  static async countAvailabilitiesByUser(userId: string): Promise<number> {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new AppError('User not found', 404);
    return prisma.availability.count({ where: { userId } });
  }

  /**
   * List all availabilities for a User
   * - User-scoped: only returns availabilities for the given userId
   */
  static async listAvailabilitiesByUser(userId: string): Promise<AvailabilityDTO[]> {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new AppError('User not found', 404);
    const availabilities = await prisma.availability.findMany({ where: { userId } });
    // Always returns array (empty if none)
    return availabilities.map(AvailabilityService.toDTO);
  }

  /**
   * Delete an availability by ID
   * - Idempotent: does not error if already deleted
   * - User cannot delete availability of another user (must be enforced at controller or by passing userId)
   *   (For now, this method only deletes if found; add userId check in future if needed)
   */
  static async deleteAvailability(availabilityId: string, userId?: string): Promise<void> {
    const availability = await prisma.availability.findUnique({ where: { id: availabilityId } });
    if (!availability) return; // Idempotent: no error if not found
    if (userId && availability.userId !== userId) {
      // Defensive: do not allow deleting another user's availability
      throw new AppError('Cannot delete availability of another user', 403);
    }
    await prisma.availability.delete({ where: { id: availabilityId } });
  }

  /**
 * Mark an availability as matched (used when an invite is accepted or a match is created)
 * - Sets status to 'matched' if not already
 * - Throws if not found
 */
  static async markAvailabilityAsMatched(availabilityId: string): Promise<AvailabilityDTO> {
    const availability = await prisma.availability.findUnique({ where: { id: availabilityId } });
    if (!availability) throw new AppError('Availability not found', 404);
    if (availability.status === 'matched') return AvailabilityService.toDTO(availability);
    const updated = await prisma.availability.update({
      where: { id: availabilityId },
      data: { status: 'matched' },
    });
    return AvailabilityService.toDTO(updated);
  }

  /**
 * Accept an availability: marks as matched and creates a match between two players at a given time
 * @param availabilityId - The availability to accept
 * @param playerAId - The first player's ID (usually the owner of the availability)
 * @param playerBId - The second player's ID (the one accepting)
 * @param scheduledAt - The Date/time for the match
 * @returns The created match object
 */
  static async acceptAvailability({
    availabilityId,
    playerAId,
    playerBId,
    scheduledAt
  }: {
    availabilityId: string;
    playerAId: string;
    playerBId: string;
    scheduledAt: Date;
  }): Promise<AcceptAvailabilityResult> {
    // Defensive: ensure all entities exist
    const [availability, playerA, playerB] = await Promise.all([
      prisma.availability.findUnique({ where: { id: availabilityId } }),
      prisma.player.findUnique({ where: { id: playerAId } }),
      prisma.player.findUnique({ where: { id: playerBId } })
    ]);
    if (!availability) throw new AppError('Availability not found', 404);
    if (!playerA) throw new AppError('Player A not found', 404);
    if (!playerB) throw new AppError('Player B not found', 404);

    // Transaction: mark as matched and create match
    const result = await prisma.$transaction(async (tx) => {
      // Mark availability as matched
      const updatedAvailability = await tx.availability.update({
        where: { id: availabilityId },
        data: { status: 'matched' }
      });
      // Create match (do not include inviteId at all if not present)
      const match = await tx.match.create({
        data: {
          inviteId: undefined,
          availabilityId: availability.id,
          playerAId,
          playerBId,
          scheduledAt
        }
      });
      return { updatedAvailability, matchId: match.id };
    });
    return {
      availability: AvailabilityService.toDTO(result.updatedAvailability),
      matchId: result.matchId
    };
  }

  /**
   * Convert Availability to DTO (API shape)
   */
  private static toDTO(availability: PrismaAvailability): AvailabilityDTO {
    return {
      id: availability.id,
      userId: availability.userId,
      date: typeof availability.date === 'string' ? availability.date : availability.date.toISOString().slice(0, 10),
      startTime: typeof availability.startTime === 'string' ? availability.startTime : availability.startTime.toISOString(),
      endTime: typeof availability.endTime === 'string' ? availability.endTime : availability.endTime.toISOString(),
      locationText: availability.locationText,
      minLevel: availability.minLevel ?? null,
      maxLevel: availability.maxLevel ?? null,
      preferredSurface: availability.preferredSurface ?? null,
      status: availability.status,
      createdAt: availability.createdAt instanceof Date ? availability.createdAt.toISOString() : availability.createdAt,
    };
  }
}
