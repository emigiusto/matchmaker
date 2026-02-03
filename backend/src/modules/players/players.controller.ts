// ---------------------
// HTTP layer for Player endpoints
// Maps HTTP requests to PlayersService methods. No business logic here.

import { Request, Response, NextFunction } from 'express';
import { PlayersService } from './players.service';
import {
  createPlayerSchema,
  updatePlayerSchema,
  playerIdParamSchema,
} from './players.validators';

// Expected flows:
// - Validate input with zod
// - Call PlayersService
// - Return clean JSON or forward error

export class PlayersController {
    /**
     * GET /players
     * List all players
     */
    static async listPlayers(req: Request, res: Response, next: NextFunction) {
      try {
        const players = await PlayersService.listPlayers();
        res.json(players);
      } catch (error) {
        next(error);
      }
    }

    /**
     * GET /players/by-city/:city
     * List players by city
     */
    static async listPlayersByCity(req: Request, res: Response, next: NextFunction) {
      try {
        const cityParam = req.params.city;
        const city = Array.isArray(cityParam) ? cityParam[0] : cityParam;
        const players = await PlayersService.listPlayersByCity(city);
        res.json(players);
      } catch (error) {
        next(error);
      }
    }

    /**
     * GET /players/count/by-city/:city
     * Count players by city
     */
    static async countPlayersByCity(req: Request, res: Response, next: NextFunction) {
      try {
        const cityParam = req.params.city;
        const city = Array.isArray(cityParam) ? cityParam[0] : cityParam;
        const count = await PlayersService.countPlayersByCity(city);
        res.json({ city, count });
      } catch (error) {
        next(error);
      }
    }

    /**
     * DELETE /players/:id
     * Delete player (soft-delete stub)
     */
    static async deletePlayer(req: Request, res: Response, next: NextFunction) {
      try {
        const { playerId } = playerIdParamSchema.parse({ playerId: req.params.id });
        await PlayersService.deletePlayer(playerId);
        res.status(204).send();
      } catch (error) {
        next(error);
      }
    }
  /**
   * POST /players
   * Create a Player for a User (upgrade)
   */
  static async createPlayer(req: Request, res: Response, next: NextFunction) {
    try {
      const parsed = createPlayerSchema.parse(req.body);
      // Ensure displayName is not undefined, or omit it if undefined
      const { userId, displayName, ...rest } = parsed;
      const playerInput = displayName !== undefined
        ? { displayName, ...rest }
        : { ...rest };
      const player = await PlayersService.createPlayerForUser(userId, playerInput as any);
      res.status(201).json(player);
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /players/:id
   * Get Player by Player ID
   */
  static async getPlayerById(req: Request, res: Response, next: NextFunction) {
    try {
      const { playerId } = playerIdParamSchema.parse({ playerId: req.params.id });
      const player = await PlayersService.getPlayerById(playerId);
      res.json(player);
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /players/by-user/:userId
   * Get Player by User ID
   */
  static async getPlayerByUserId(req: Request, res: Response, next: NextFunction) {
    try {
      const { userId } = req.params;
      // Ensure userId is a string (not string[])
      if (Array.isArray(userId)) {
        return next(new Error('Invalid userId parameter'));
      }
      const player = await PlayersService.getPlayerByUserId(userId);
      res.json(player);
    } catch (error) {
      next(error);
    }
  }

  /**
   * PATCH /players/:id
   * Update Player (partial)
   */
  static async updatePlayer(req: Request, res: Response, next: NextFunction) {
    try {
      const { playerId } = playerIdParamSchema.parse({ playerId: req.params.id });
      const parsed = updatePlayerSchema.parse(req.body);
      const player = await PlayersService.updatePlayer(playerId, parsed);
      res.json(player);
    } catch (error) {
      next(error);
    }
  }
}
