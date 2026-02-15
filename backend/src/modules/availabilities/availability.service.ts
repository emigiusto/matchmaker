
// availability.service.ts
// ----------------------
// Core logic for Availability management
//
// DESIGN RULES (Invite-First Architecture):
//
// - Availability represents intent, not commitment.
// - Availability NEVER creates a Match directly.
// - Matches are created ONLY via Invite acceptance.
// - Even when a user "accepts an availability" from the UI, the backend must:
//     Invite → Accept Invite → Create Match
// - AvailabilityService must NOT:
//     - create matches
//     - send notifications
//     - reference Player entities
//     - contain matchmaking logic
//
// This module manages availabilities for Users (not Players).
// - Each Availability belongs to exactly one User (user-scoped, not player-scoped).
// - No overlap detection yet (handled in future logic).
// - No Invite or Matchmaking logic here.
// - No Player references anywhere in this module.
//
// Future: Overlap detection, Player-based availability, and integration with invites/matchmaking.

import { AppError } from '../../shared/errors/AppError';
import { AvailabilityDTO, CreateAvailabilityInput } from './availability.types';
import { Availability as PrismaAvailability } from '@prisma/client';
// No AcceptAvailabilityResult import (Invite-first design)
import { logger } from '../../config/logger';
import { prisma } from '../../prisma';

export class AvailabilityService {
  /**
   * Create an availability slot for a User
   * - Validates User existence
   * - No overlap detection yet
   */
  static async createAvailability(userId: string, data: CreateAvailabilityInput): Promise<AvailabilityDTO> {
    try {
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
    } catch (err) {
      logger.error('Error in createAvailability', { userId, error: err instanceof Error ? err.message : err });
      throw err;
    }
  }

  /**
   * Get a single availability by ID
   */
  static async getAvailabilityById(availabilityId: string): Promise<AvailabilityDTO | null> {
    try {
      const availability = await prisma.availability.findUnique({ where: { id: availabilityId } });
      if (!availability) return null;
      return AvailabilityService.toDTO(availability);
    } catch (err) {
      logger.error('Error in getAvailabilityById', { availabilityId, error: err instanceof Error ? err.message : err });
      throw err;
    }
  }

  /**
   * List availabilities by date (optionally filtered by userId)
   */
  static async listAvailabilitiesByDate(date: string, userId?: string): Promise<AvailabilityDTO[]> {
    try {
      const where: { date: string; userId?: string } = { date };
      if (userId) where.userId = userId;
      const availabilities = await prisma.availability.findMany({ where });
      return availabilities.map(AvailabilityService.toDTO);
    } catch (err) {
      logger.error('Error in listAvailabilitiesByDate', { date, userId, error: err instanceof Error ? err.message : err });
      throw err;
    }
  }

  /**
   * Count availabilities for a user
   */
  static async countAvailabilitiesByUser(userId: string): Promise<number> {
    try {
      const user = await prisma.user.findUnique({ where: { id: userId } });
      if (!user) throw new AppError('User not found', 404);
      return prisma.availability.count({ where: { userId } });
    } catch (err) {
      logger.error('Error in countAvailabilitiesByUser', { userId, error: err instanceof Error ? err.message : err });
      throw err;
    }
  }

  /**
   * List all availabilities for a User
   * - User-scoped: only returns availabilities for the given userId
   */
  static async listAvailabilitiesByUser(userId: string): Promise<AvailabilityDTO[]> {
    try {
      const user = await prisma.user.findUnique({ where: { id: userId } });
      if (!user) throw new AppError('User not found', 404);
      const availabilities = await prisma.availability.findMany({ where: { userId } });
      // Always returns array (empty if none)
      return availabilities.map(AvailabilityService.toDTO);
    } catch (err) {
      logger.error('Error in listAvailabilitiesByUser', { userId, error: err instanceof Error ? err.message : err });
      throw err;
    }
  }

  /**
   * Delete an availability by ID
   * - Idempotent: does not error if already deleted
   * - User cannot delete availability of another user (must be enforced at controller or by passing userId)
   *   (For now, this method only deletes if found; add userId check in future if needed)
   */
  static async deleteAvailability(availabilityId: string, userId?: string): Promise<void> {
    try {
      const availability = await prisma.availability.findUnique({ where: { id: availabilityId } });
      if (!availability) return; // Idempotent: no error if not found
      if (userId && availability.userId !== userId) {
        // Defensive: do not allow deleting another user's availability
        throw new AppError('Cannot delete availability of another user', 403);
      }
      await prisma.availability.delete({ where: { id: availabilityId } });
    } catch (err) {
      logger.error('Error in deleteAvailability', { availabilityId, userId, error: err instanceof Error ? err.message : err });
      throw err;
    }
  }

  /**
   * Mark an availability as matched (used ONLY as a side-effect of Invite acceptance)
   *
   * This method may be called ONLY from InviteService or MatchService.
   * It is a side-effect of Invite acceptance, not a user action.
   */
  static async markAvailabilityAsMatched(availabilityId: string): Promise<AvailabilityDTO> {
    try {
      const availability = await prisma.availability.findUnique({ where: { id: availabilityId } });
      if (!availability) throw new AppError('Availability not found', 404);
      if (availability.status === 'matched') return AvailabilityService.toDTO(availability);
      const updated = await prisma.availability.update({
        where: { id: availabilityId },
        data: { status: 'matched' },
      });
      return AvailabilityService.toDTO(updated);
    } catch (err) {
      logger.error('Error in markAvailabilityAsMatched', { availabilityId, error: err instanceof Error ? err.message : err });
      throw err;
    }
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
