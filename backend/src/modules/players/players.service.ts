// players.service.ts
// ------------------
// Core logic for Player management
//
// This module manages Player entities (tennis personas) and their preferred surfaces.
// It does NOT handle social (friends) or matchmaking logic.

import { Player } from '@prisma/client';
import { cacheGet, cacheSet } from '../../shared/cache/redis';
import { prisma } from '../../prisma';
import { AppError } from '../../shared/errors/AppError';
import { CreatePlayerInput, UpdatePlayerInput, PlayerDTO } from './players.types';

/**
 * Player vs User:
 * - User: Represents a registered account. Can exist without a Player forever.
 * - Player: Represents the tennis persona/profile of a User. Created only by explicit upgrade.
 *   Not all Users are Players.
 * - Progressive enrichment: Users can add tennis-specific data by creating a Player.
 * - Player is NOT created automatically for any User.
 *
 * This module does NOT handle social (friends) or matchmaking logic.
 */

export class PlayersService {
  /**
   * Fetch PlayerDTO for a single userId using Redis cache.
   * @param userId User ID
   * @returns PlayerDTO or throws if not found
   */
  static async findPlayerByUserIdCached(userId: string): Promise<PlayerDTO> {
    const cacheKey = `playerdto:${userId}`;
    try {
      const cached = await cacheGet(cacheKey);
      if (cached) {
        return JSON.parse(cached);
      }
    } catch (err) {
      // Ignore cache errors
    }
    const player = await prisma.player.findUnique({ where: { userId } });
    if (!player) throw new AppError('Player not found', 404);
    const surfaces = await prisma.playerSurface.findMany({ where: { playerId: player.id } });
    const dto = PlayersService.toDTO(player, surfaces.map((s: { surface: string }) => s.surface));
    try {
      await cacheSet(cacheKey, JSON.stringify(dto), 60 * 60 * 24); // cache for 24 hours
    } catch (err) {
      // Ignore cache set errors
    }
    return dto;
  }

  /**
   * Fetch PlayerDTOs for a list of user IDs using Redis cache.
   * @param userIds Array of user IDs
   * @returns Array of PlayerDTOs
   */
  static async findPlayersByUserIdsCached(userIds: string[]): Promise<PlayerDTO[]> {
    const result: PlayerDTO[] = [];
    for (const userId of userIds) {
      try {
        const dto = await PlayersService.findPlayerByUserIdCached(userId);
        result.push(dto);
      } catch (err) {
        // Optionally skip or handle missing players
      }
    }
    return result;
  }

  /**
   * Fetch PlayerDTOs for an array of userIds, using a local cache if available.
   * @param userIds Array of user IDs
   * @param cache Optional Map<string, PlayerDTO> for local caching
   * @returns Array of PlayerDTOs
   */
  static async findPlayersByUserIds(userIds: string[], cache?: Map<string, PlayerDTO>): Promise<PlayerDTO[]> {
    const result: PlayerDTO[] = [];
    const uncachedIds: string[] = [];
    for (const id of userIds) {
      if (cache && cache.has(id)) {
        result.push(cache.get(id)!);
      } else {
        uncachedIds.push(id);
      }
    }
    if (uncachedIds.length > 0) {
      const players = await prisma.player.findMany({ where: { userId: { in: uncachedIds } } });
      for (const player of players) {
        const surfaces = await prisma.playerSurface.findMany({ where: { playerId: player.id } });
        const dto = PlayersService.toDTO(player, surfaces.map((s: { surface: string }) => s.surface));
        if (cache) {
          cache.set(player.userId, dto);
        }
        result.push(dto);
      }
    }
    return result;
  }
  /**
   * List all players (for admin or UI)
   */
  static async listPlayers(): Promise<PlayerDTO[]> {
    const players = await prisma.player.findMany();
    return Promise.all(players.map(async (player: Player) => {
      const surfaces = await prisma.playerSurface.findMany({ where: { playerId: player.id } });
      return PlayersService.toDTO(player, surfaces.map((s: { surface: string }) => s.surface));
    }));
  }

  /**
   * List players by city
   */
  static async listPlayersByCity(city: string): Promise<PlayerDTO[]> {
    const players = await prisma.player.findMany({ where: { defaultCity: city } });
    return Promise.all(players.map(async (player: Player) => {
      const surfaces = await prisma.playerSurface.findMany({ where: { playerId: player.id } });
      return PlayersService.toDTO(player, surfaces.map((s: { surface: string }) => s.surface));
    }));
  }

  /**
   * Count players by city
   */
  static async countPlayersByCity(city: string): Promise<number> {
    return prisma.player.count({ where: { defaultCity: city } });
  }

  /**
   * Soft-delete player: set deletedAt timestamp
   * Player is not removed from DB, but marked as deleted
   */
  static async deletePlayer(playerId: string): Promise<void> {
    const player = await prisma.player.findUnique({ where: { id: playerId } });
    if (!player) throw new AppError('Player not found', 404);
    if ((player as any).deletedAt) throw new AppError('Player already deleted', 410);
    await prisma.player.update({
      where: { id: playerId },
      data: { deletedAt: new Date() },
    });
  }

  /**
   * Helper: Replace all PlayerSurface entries for a player (no duplicates)
   * Uses the shared prisma instance directly. Not transactional with Player changes.
   */
  private static async replacePlayerSurfaces(playerId: string, surfaces?: string[]) {
    // Remove all existing PlayerSurface entries for this player
    await prisma.playerSurface.deleteMany({ where: { playerId } });
    if (surfaces && surfaces.length > 0) {
      // Remove duplicates from input
      const uniqueSurfaces = Array.from(new Set(surfaces));
      await Promise.all(
        uniqueSurfaces.map((surface) =>
          prisma.playerSurface.create({
            data: { playerId, surface },
          })
        )
      );
    }
  }

  /**
   * Create a Player for a User (upgrade)
   * - Only one Player per User (enforced)
   * - Sets User.isGuest = false
   * - Handles preferred surfaces via PlayerSurface join table
   */
  static async createPlayerForUser(userId: string, data: CreatePlayerInput): Promise<PlayerDTO> {
    // Not transactional with PlayerSurface changes
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new AppError('User not found', 404);
    const existingPlayer = await prisma.player.findUnique({ where: { userId } });
    if (existingPlayer) throw new AppError('Player already exists for this user', 409);
    // Create Player (tennis persona)
    const player = await prisma.player.create({
      data: {
        userId,
        displayName: data.displayName ?? user.name ?? undefined,
        levelValue: data.levelValue,
        levelConfidence: data.levelConfidence,
        defaultCity: data.defaultCity,
        latitude: data.latitude,
        longitude: data.longitude,
      },
    });
    // Replace all PlayerSurface entries (no duplicates)
    await PlayersService.replacePlayerSurfaces(player.id, data.preferredSurfaces);
    // Set User.isGuest = false (progressive enrichment)
    await prisma.user.update({ where: { id: userId }, data: { isGuest: false } });
    // Fetch actual surfaces
    const surfaces = await prisma.playerSurface.findMany({ where: { playerId: player.id } });
    // Return PlayerDTO
    return PlayersService.toDTO(player, surfaces.map((s: { surface: string }) => s.surface));
  }

  /**
   * Get Player by Player ID
   */
  static async getPlayerById(playerId: string): Promise<PlayerDTO> {
    const player = await prisma.player.findUnique({ where: { id: playerId } });
    if (!player) throw new AppError('Player not found', 404);
    const surfaces = await prisma.playerSurface.findMany({ where: { playerId } });
    return PlayersService.toDTO(player, surfaces.map((s: { surface: string }) => s.surface));
  }

  /**
   * Get Player by User ID
   */
  static async getPlayerByUserId(userId: string): Promise<PlayerDTO> {
    const player = await prisma.player.findUnique({ where: { userId } });
    if (!player) throw new AppError('Player not found', 404);
    const surfaces = await prisma.playerSurface.findMany({ where: { playerId: player.id } });
    return PlayersService.toDTO(player, surfaces.map((s: { surface: string }) => s.surface));
  }

  /**
   * Update Player (partial)
   * - Handles preferred surfaces via PlayerSurface join table
   */
  static async updatePlayer(playerId: string, data: UpdatePlayerInput): Promise<PlayerDTO> {
    // Not transactional with PlayerSurface changes
    const player = await prisma.player.findUnique({ where: { id: playerId } });
    if (!player) throw new AppError('Player not found', 404);
    // Update Player fields (tennis persona)
    const updatedPlayer = await prisma.player.update({
      where: { id: playerId },
      data: {
        displayName: data.displayName,
        levelValue: data.levelValue,
        levelConfidence: data.levelConfidence,
        defaultCity: data.defaultCity,
      },
    });
    // Replace all PlayerSurface entries (no duplicates) if provided
    if (data.preferredSurfaces) {
      await PlayersService.replacePlayerSurfaces(playerId, data.preferredSurfaces);
    }
    // Fetch current surfaces
    const surfaces = await prisma.playerSurface.findMany({ where: { playerId } });
    return PlayersService.toDTO(updatedPlayer, surfaces.map((s: { surface: string }) => s.surface));
  }

  /**
   * Convert Player + surfaces to PlayerDTO (API shape)
   * Never exposes internal PlayerSurface model.
   */
  private static toDTO(player: Player, preferredSurfaces?: string[]): PlayerDTO {
    return {
      id: player.id,
      userId: player.userId,
      displayName: player.displayName ?? '',
      levelValue: player.levelValue ?? undefined,
      levelConfidence: player.levelConfidence ?? undefined,
      preferredSurfaces: preferredSurfaces ?? [],
      defaultCity: player.defaultCity ?? undefined,
      latitude: player.latitude ?? undefined,
      longitude: player.longitude ?? undefined,
    };
  }
}
