// players.service.ts
// ------------------
// Core logic for Player management
//
// This module manages Player entities (tennis personas) and their preferred surfaces.
// It does NOT handle social (friends) or matchmaking logic.

import { PrismaClient, Player } from '@prisma/client';
import { AppError } from '../../shared/errors/AppError';
import { CreatePlayerInput, UpdatePlayerInput, PlayerDTO } from './players.types';

const prisma = new PrismaClient();

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
   * Helper: Replace all PlayerSurface entries for a player (no duplicates)
   * - Accepts either PrismaClient or transaction client for tx
   * - Deletes all existing PlayerSurface entries for the player
   * - Adds new entries for unique surfaces only
   * - Keeps logic in service layer, never exposes PlayerSurface directly
   */
  private static async replacePlayerSurfaces(
    tx: { playerSurface: PrismaClient['playerSurface'] },
    playerId: string,
    surfaces?: string[]
  ) {
    // Remove all existing PlayerSurface entries for this player
    await tx.playerSurface.deleteMany({ where: { playerId } });
    if (surfaces && surfaces.length > 0) {
      // Remove duplicates from input
      const uniqueSurfaces = Array.from(new Set(surfaces));
      await Promise.all(
        uniqueSurfaces.map((surface) =>
          tx.playerSurface.create({
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
    return await prisma.$transaction(async (tx) => {
      const user = await tx.user.findUnique({ where: { id: userId } });
      if (!user) throw new AppError('User not found', 404);
      const existingPlayer = await tx.player.findUnique({ where: { userId } });
      if (existingPlayer) throw new AppError('Player already exists for this user', 409);
      // Create Player (tennis persona)
      const player = await tx.player.create({
        data: {
          userId,
          displayName: data.displayName ?? user.name ?? undefined,
          levelValue: data.levelValue,
          levelConfidence: data.levelConfidence,
          defaultCity: data.defaultCity,
        },
      });
      // Replace all PlayerSurface entries (no duplicates)
      await PlayersService.replacePlayerSurfaces(tx, player.id, data.preferredSurfaces);
      // Set User.isGuest = false (progressive enrichment)
      await tx.user.update({ where: { id: userId }, data: { isGuest: false } });
      // Fetch actual surfaces
      const surfaces = await tx.playerSurface.findMany({ where: { playerId: player.id } });
      // Return PlayerDTO
      return PlayersService.toDTO(player, surfaces.map(s => s.surface));
    });
  }

  /**
   * Get Player by Player ID
   */
  static async getPlayerById(playerId: string): Promise<PlayerDTO> {
    const player = await prisma.player.findUnique({ where: { id: playerId } });
    if (!player) throw new AppError('Player not found', 404);
    const surfaces = await prisma.playerSurface.findMany({ where: { playerId } });
    return PlayersService.toDTO(player, surfaces.map(s => s.surface));
  }

  /**
   * Get Player by User ID
   */
  static async getPlayerByUserId(userId: string): Promise<PlayerDTO> {
    const player = await prisma.player.findUnique({ where: { userId } });
    if (!player) throw new AppError('Player not found', 404);
    const surfaces = await prisma.playerSurface.findMany({ where: { playerId: player.id } });
    return PlayersService.toDTO(player, surfaces.map(s => s.surface));
  }

  /**
   * Update Player (partial)
   * - Handles preferred surfaces via PlayerSurface join table
   */
  static async updatePlayer(playerId: string, data: UpdatePlayerInput): Promise<PlayerDTO> {
    return await prisma.$transaction(async (tx) => {
      const player = await tx.player.findUnique({ where: { id: playerId } });
      if (!player) throw new AppError('Player not found', 404);
      // Update Player fields (tennis persona)
      const updatedPlayer = await tx.player.update({
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
        await PlayersService.replacePlayerSurfaces(tx, playerId, data.preferredSurfaces);
      }
      // Fetch current surfaces
      const surfaces = await tx.playerSurface.findMany({ where: { playerId } });
      return PlayersService.toDTO(updatedPlayer, surfaces.map(s => s.surface));
    });
  }

  /**
   * Soft-delete Player (future TODO)
   */
  static async deletePlayer(playerId: string): Promise<void> {
    // TODO: Implement soft-delete logic (e.g., set deletedAt)
    throw new AppError('Soft-delete not implemented yet', 501);
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
    };
  }
}
