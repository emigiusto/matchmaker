// players.service.ts
// ------------------
// Core logic for Player management
//
// This module manages Player entities (tennis personas) and their preferred surfaces.
// It does NOT handle social (friends) or matchmaking logic.

import { Player } from '@prisma/client';
import { cacheGet, cacheSet, cacheDel } from '../../shared/cache/redis';
import { prisma } from '../../prisma';
import { AppError } from '../../shared/errors/AppError';
import { CreatePlayerInput, UpdatePlayerInput, PlayerDTO, PlayerStatsDTO } from './players.types';
import { computeDecayedConfidence } from '../rating/utils/confidence.utils';
import { EloRatingAlgorithm } from '../rating/algorithms/elo.algorithm';

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
    const player = await prisma.player.findUnique({ where: { userId }, include: { user: { select: { name: true } } } });
    if (!player) throw new AppError('Player not found', 404);
    const surfaces = await prisma.playerSurface.findMany({ where: { playerId: player.id } });
    const dto = PlayersService.toDTO(player, player.user.name ?? '', surfaces.map((s: { surface: string }) => s.surface));
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
      const players = await prisma.player.findMany({ where: { userId: { in: uncachedIds } }, include: { user: { select: { name: true } } } });
      for (const player of players) {
        const surfaces = await prisma.playerSurface.findMany({ where: { playerId: player.id } });
        const dto = PlayersService.toDTO(player, player.user.name ?? '', surfaces.map((s: { surface: string }) => s.surface));
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
    const players = await prisma.player.findMany({ include: { user: { select: { name: true } } } });
    return Promise.all(players.map(async (player) => {
      const surfaces = await prisma.playerSurface.findMany({ where: { playerId: player.id } });
      return PlayersService.toDTO(player, player.user.name ?? '', surfaces.map((s: { surface: string }) => s.surface));
    }));
  }

  /**
   * List players by city
   */
  static async listPlayersByCity(city: string): Promise<PlayerDTO[]> {
    const players = await prisma.player.findMany({ where: { defaultCity: city }, include: { user: { select: { name: true } } } });
    return Promise.all(players.map(async (player) => {
      const surfaces = await prisma.playerSurface.findMany({ where: { playerId: player.id } });
      return PlayersService.toDTO(player, player.user.name ?? '', surfaces.map((s: { surface: string }) => s.surface));
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
        levelValue: data.levelValue,
        levelConfidence: data.levelConfidence,
        defaultCity: data.defaultCity,
        preferredClub: data.preferredClub,
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
    return PlayersService.toDTO(player, user.name ?? '', surfaces.map((s: { surface: string }) => s.surface));
  }

  /**
   * Get Player by Player ID
   */
  static async getPlayerById(playerId: string): Promise<PlayerDTO> {
    const player = await prisma.player.findUnique({ where: { id: playerId }, include: { user: { select: { name: true } } } });
    if (!player) throw new AppError('Player not found', 404);
    const surfaces = await prisma.playerSurface.findMany({ where: { playerId } });
    return PlayersService.toDTO(player, player.user.name ?? '', surfaces.map((s: { surface: string }) => s.surface));
  }

  /**
   * Get Player by User ID
   */
  static async getPlayerByUserId(userId: string): Promise<PlayerDTO> {
    const player = await prisma.player.findUnique({ where: { userId }, include: { user: { select: { name: true } } } });
    if (!player) throw new AppError('Player not found', 404);
    const surfaces = await prisma.playerSurface.findMany({ where: { playerId: player.id } });
    return PlayersService.toDTO(player, player.user.name ?? '', surfaces.map((s: { surface: string }) => s.surface));
  }

  /**
   * Update Player (partial)
   * - Handles preferred surfaces via PlayerSurface join table
   */
  static async updatePlayer(playerId: string, data: UpdatePlayerInput): Promise<PlayerDTO> {
    // Not transactional with PlayerSurface changes
    const player = await prisma.player.findUnique({ where: { id: playerId } });
    if (!player) throw new AppError('Player not found', 404);
    await cacheDel(`playerdto:${player.userId}`);
    // Update Player fields (tennis persona)
    const updatedPlayer = await prisma.player.update({
      where: { id: playerId },
      data: {
        levelValue: data.levelValue,
        levelConfidence: data.levelConfidence,
        defaultCity: data.defaultCity,
        preferredClub: data.preferredClub,
      },
      include: { user: { select: { name: true } } },
    });
    // Replace all PlayerSurface entries (no duplicates) if provided
    if (data.preferredSurfaces) {
      await PlayersService.replacePlayerSurfaces(playerId, data.preferredSurfaces);
    }
    // Fetch current surfaces
    const surfaces = await prisma.playerSurface.findMany({ where: { playerId } });
    return PlayersService.toDTO(updatedPlayer, updatedPlayer.user.name ?? '', surfaces.map((s: { surface: string }) => s.surface));
  }

  /**
   * Compute player statistics from confirmed Results and RatingHistory.
   * Win/loss counts are derived from source records, never cached counters.
   */
  static async getPlayerStats(playerId: string): Promise<PlayerStatsDTO> {
    const player = await prisma.player.findUnique({ where: { id: playerId } });
    if (!player) throw new AppError('Player not found', 404);

    // Fetch all confirmed competitive matches this player participated in
    const competitiveResults = await prisma.result.findMany({
      where: {
        status: 'confirmed',
        match: {
          type: 'competitive',
          participants: { some: { userId: player.userId } },
        },
      },
      include: {
        match: {
          include: {
            participants: {
              include: { user: { include: { player: { select: { levelValue: true } } } } },
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    const practiceCount = await prisma.result.count({
      where: {
        status: 'confirmed',
        match: {
          type: 'practice',
          participants: { some: { userId: player.userId } },
        },
      },
    });

    const wins = competitiveResults.filter(r => r.winnerUserId === player.userId).length;
    const losses = competitiveResults.length - wins;

    // Current streak: consecutive results from most recent
    let currentStreak = 0;
    let streakType: 'win' | 'loss' | 'none' = 'none';
    for (const r of competitiveResults) {
      const isWin = r.winnerUserId === player.userId;
      if (currentStreak === 0) {
        streakType = isWin ? 'win' : 'loss';
        currentStreak = 1;
      } else if ((streakType === 'win') === isWin) {
        currentStreak++;
      } else {
        break;
      }
    }

    // Average opponent level
    const opponentLevels: number[] = [];
    for (const r of competitiveResults) {
      const participants: any[] = (r.match as any).participants ?? [];
      for (const p of participants) {
        if (p.userId !== player.userId) {
          const lvl = p.user?.player?.levelValue;
          if (typeof lvl === 'number') opponentLevels.push(lvl);
        }
      }
    }
    const averageOpponentLevel = opponentLevels.length > 0
      ? opponentLevels.reduce((a, b) => a + b, 0) / opponentLevels.length
      : null;

    // Rating history from RatingHistory table (oldest first for chart)
    const ratingRows = await prisma.ratingHistory.findMany({
      where: { playerId },
      orderBy: { createdAt: 'asc' },
    });
    const ratingHistory = ratingRows.map(row => ({
      date: row.createdAt.toISOString(),
      rating: row.newRating,
      delta: row.delta,
    }));

    return {
      totalMatches: competitiveResults.length + practiceCount,
      competitiveMatches: competitiveResults.length,
      practiceMatches: practiceCount,
      wins,
      losses,
      winRate: competitiveResults.length > 0 ? wins / competitiveResults.length : 0,
      currentStreak,
      streakType,
      averageOpponentLevel,
      ratingHistory,
    };
  }

  /**
   * Convert Player + surfaces to PlayerDTO (API shape)
   * Never exposes internal PlayerSurface model.
   */
  private static toDTO(player: Player, userName: string, preferredSurfaces?: string[]): PlayerDTO {
    // Elo config for decay (should match runtime config)
    const eloConfig = new EloRatingAlgorithm();
    const storedConfidence = player.levelConfidence ?? undefined;
    const lastMatchAt = player.lastMatchAt ?? null;
    let effectiveConfidence: number | undefined = undefined;
    if (typeof storedConfidence === 'number') {
      effectiveConfidence = computeDecayedConfidence(
        storedConfidence,
        lastMatchAt,
        new Date(),
        (eloConfig as any).confidenceDecayRate,
        (eloConfig as any).inactivityThresholdDays,
        (eloConfig as any).minConfidence
      );
    }
    return {
      id: player.id,
      userId: player.userId,
      name: userName,
      levelValue: player.levelValue ?? undefined,
      levelConfidence: storedConfidence,
      effectiveConfidence,
      lastMatchAt: lastMatchAt ?? undefined,
      preferredSurfaces: preferredSurfaces ?? [],
      defaultCity: player.defaultCity ?? undefined,
      preferredClub: (player as any).preferredClub ?? undefined,
      latitude: player.latitude ?? undefined,
      longitude: player.longitude ?? undefined,
    };
  }
}
