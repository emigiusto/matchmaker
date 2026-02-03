// matches.controller.ts
// HTTP layer for matches. No business logic here.
//
// Matches are derived entities: they are only created via Invite confirmation and are immutable.
// No POST/PUT/DELETE: matches are read-only. No WhatsApp or external messaging logic here.
//
// Expected frontend usage:
// - GET /matches/:id                → Fetch a single match by ID
// - GET /matches?userId=...         → List matches for a user
// - GET /matches/by-player/:playerId → List matches for a player

import { Request, Response, NextFunction } from 'express';
import * as MatchesService from './matches.service';

/**
 * MatchesController: HTTP layer for matches (read-only).
 * All methods are static and stateless.
 */
export class MatchesController {
    /**
     * GET /matches/upcoming?userId=...
     * List upcoming matches for a user (scheduledAt > now)
     */
    static async listUpcomingMatchesForUser(req: Request, res: Response, next: NextFunction) {
      try {
        const { userId } = req.query;
        if (!userId || typeof userId !== 'string') {
          return res.status(400).json({ error: 'Missing or invalid userId' });
        }
        const matches = await MatchesService.listUpcomingMatchesForUser(userId);
        res.json(matches);
      } catch (err) {
        next(err);
      }
    }

    /**
     * GET /matches/past?userId=...
     * List past matches for a user (scheduledAt < now)
     */
    static async listPastMatchesForUser(req: Request, res: Response, next: NextFunction) {
      try {
        const { userId } = req.query;
        if (!userId || typeof userId !== 'string') {
          return res.status(400).json({ error: 'Missing or invalid userId' });
        }
        const matches = await MatchesService.listPastMatchesForUser(userId);
        res.json(matches);
      } catch (err) {
        next(err);
      }
    }

    /**
     * GET /matches/for-venue/:venueId
     * List matches scheduled at a specific venue
     */
    static async listMatchesForVenue(req: Request, res: Response, next: NextFunction) {
      try {
        const { venueId } = req.params;
        if (!venueId || typeof venueId !== 'string') {
          return res.status(400).json({ error: 'Missing or invalid venueId' });
        }
        const matches = await MatchesService.listMatchesForVenue(venueId);
        res.json(matches);
      } catch (err) {
        next(err);
      }
    }

    /**
     * GET /matches/recent?limit=10
     * List the most recent matches (optionally filtered by user)
     */
    static async listRecentMatches(req: Request, res: Response, next: NextFunction) {
      try {
        const { limit, userId } = req.query;
        const parsedLimit = limit && typeof limit === 'string' ? parseInt(limit, 10) : 10;
        const matches = await MatchesService.listRecentMatches(parsedLimit, typeof userId === 'string' ? userId : undefined);
        res.json(matches);
      } catch (err) {
        next(err);
      }
    }
  /**
   * GET /matches/:id
   * Fetch a single match by ID
   */
  static async getMatchById(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      if (!id || typeof id !== 'string') return res.status(400).json({ error: 'Missing or invalid match id' });
      const match = await MatchesService.getMatchById(id);
      if (!match) return res.status(404).json({ error: 'Match not found' });
      res.json(match);
    } catch (err) {
      next(err);
    }
  }

  /**
   * GET /matches?userId=...
   * List matches for a user
   */
  static async listMatchesForUser(req: Request, res: Response, next: NextFunction) {
    try {
      const { userId } = req.query;
      if (!userId || typeof userId !== 'string') {
        return res.status(400).json({ error: 'Missing or invalid userId' });
      }
      const matches = await MatchesService.listMatchesForUser(userId);
      res.json(matches);
    } catch (err) {
      next(err);
    }
  }

  /**
   * GET /matches/by-player/:playerId
   * List matches for a player
   */
  static async listMatchesForPlayer(req: Request, res: Response, next: NextFunction) {
    try {
      const { playerId } = req.params;
      if (!playerId || typeof playerId !== 'string') {
        return res.status(400).json({ error: 'Missing or invalid playerId' });
      }
      const matches = await MatchesService.listMatchesForPlayer(playerId);
      res.json(matches);
    } catch (err) {
      next(err);
    }
  }
}
