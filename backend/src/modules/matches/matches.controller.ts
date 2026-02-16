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

  /**
   * POST /matches/:id/complete
   * Complete a match (admin override only)
   */
  static async completeMatch(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      if (!id || typeof id !== 'string') return res.status(400).json({ error: 'Missing or invalid match id' });
      const currentUserId = req.user?.id;
      const isAdmin = !!req.user?.isAdmin;
      if (!isAdmin) return res.status(403).json({ error: 'Forbidden: Admins only' });
      if (!currentUserId || typeof currentUserId !== 'string') {
        return res.status(401).json({ error: 'Unauthorized: Missing user id' });
      }
      const match = await MatchesService.completeMatch(id, currentUserId, isAdmin);
      res.json(match);
    } catch (err) {
      next(err);
    }
  }

  /**
   * POST /matches/:id/cancel
   * Cancel a match (scheduled -> cancelled)
   * Only hostUserId can cancel
   */
  static async cancelMatch(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const { userId } = req.body;
      if (!id || typeof id !== 'string') return res.status(400).json({ error: 'Missing or invalid match id' });
      if (!userId || typeof userId !== 'string') return res.status(400).json({ error: 'Missing or invalid userId' });
      const match = await MatchesService.cancelMatch(id, userId);
      res.json(match);
    } catch (err) {
      next(err);
    }
  }

  /**
   * POST /matches
   * Directly create a match (bypassing invite flow)
   */
  static async createMatch(req: Request, res: Response, next: NextFunction) {
    try {
      const input = req.body;
      // Validate required fields including type
      if (!input.hostUserId || !input.opponentUserId || !input.scheduledAt || !input.type) {
        return res.status(400).json({ error: 'Missing required fields: hostUserId, opponentUserId, scheduledAt, type' });
      }
      // Validate type value
      if (input.type !== 'competitive' && input.type !== 'practice') {
        return res.status(400).json({ error: 'Invalid match type. Must be "competitive" or "practice".' });
      }
      const match = await MatchesService.createMatch(input);
      return res.status(201).json(match);
    } catch (error) {
      next(error);
    }
  }
}
