// results.controller.ts
// HTTP layer for results. No business logic here.
//
// Expected frontend flows:
// - POST /results: Create a result for a match
// - POST /results/:id/sets: Add a set result to a result
// - GET /results/by-match/:matchId: Fetch result for a match

import { Request, Response, NextFunction } from 'express';
import * as ResultsService from './results.service';
import {
  createResultSchema,
  addSetResultSchema,
  matchIdParamSchema,
  resultIdParamSchema,
} from './results.validators';

/**
 * ResultsController: HTTP layer for results (read-only, no business logic)
 * All methods are static and stateless.
 */
export class ResultsController {
  /**
   * POST /results
   * Create a result for a match
   */
  static async createResult(req: Request, res: Response, next: NextFunction) {
    try {
      const parsed = createResultSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: 'Invalid request body', details: parsed.error.issues });
      }
      const { matchId, winnerUserId } = parsed.data;
      if (matchId == null || winnerUserId == null) {
        return res.status(400).json({ error: 'matchId and winnerUserId must not be null' });
      }
      // Type assertion for req.user (assume authentication middleware attaches user)
      const currentUserId = req.user?.id;
      const isAdmin = !!req.user?.isAdmin;
      if (!currentUserId) {
        return res.status(401).json({ error: 'Unauthorized: missing user id' });
      }
      const result = await ResultsService.createResult(matchId, winnerUserId, currentUserId, isAdmin);
      return res.status(201).json(result);
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /results/:id/sets
   * Add a set result to a result
   */
  static async addSetResult(req: Request, res: Response, next: NextFunction) {
    try {
      const params = resultIdParamSchema.safeParse(req.params);
      if (!params.success) {
        return res.status(400).json({ error: 'Invalid resultId param', details: params.error.issues });
      }
      const setData = addSetResultSchema.safeParse(req.body);
      if (!setData.success) {
        return res.status(400).json({ error: 'Invalid set data', details: setData.error.issues });
      }
      const set = await ResultsService.addSetResult(params.data.resultId, setData.data);
      return res.status(201).json(set);
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /results/by-match/:matchId
   * Fetch result for a match
   */
  static async getResultByMatch(req: Request, res: Response, next: NextFunction) {
    try {
      const params = matchIdParamSchema.safeParse(req.params);
      if (!params.success) {
        return res.status(400).json({ error: 'Invalid matchId param', details: params.error.issues });
      }
      const result = await ResultsService.getResultByMatch(params.data.matchId);
      return res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /results/by-user/:userId
   * Fetch all results for a user
   */
  static async getResultsByUser(req: Request, res: Response, next: NextFunction) {
    try {
      const { userId } = req.params;
      if (!userId || typeof userId !== 'string') {
        return res.status(400).json({ error: 'Missing or invalid userId' });
      }
      const results = await ResultsService.getResultsByUser(userId);
      return res.status(200).json(results);
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /results/recent?limit=10
   * Fetch recent results
   */
  static async getRecentResults(req: Request, res: Response, next: NextFunction) {
    try {
      const { limit } = req.query;
      const parsedLimit = limit && typeof limit === 'string' ? parseInt(limit, 10) : 10;
      const results = await ResultsService.getRecentResults(parsedLimit);
      return res.status(200).json(results);
    } catch (error) {
      next(error);
    }
  }

  /**
  * POST /matches/:matchId/submit-result
  * Unified endpoint to submit result and sets
  */
  static async submitMatchResult(req: Request, res: Response, next: NextFunction) {
    try {
      const { matchId } = req.params;
      if (!matchId || typeof matchId !== 'string') {
        return res.status(400).json({ error: 'Missing or invalid matchId' });
      }
      // Validate request body
      const sets = req.body.sets;
      if (!Array.isArray(sets) || sets.length === 0) {
        return res.status(400).json({ error: 'Missing or invalid sets array' });
      }
      const currentUserId = req.user?.id;
      if (!currentUserId) {
        return res.status(401).json({ error: 'Unauthorized: missing user id' });
      }
      // Call service (winnerUserId will be computed server-side)
      const result = await ResultsService.submitMatchResult({
        matchId,
        sets,
        currentUserId
      });
      return res.status(201).json(result);
    } catch (error) {
      next(error);
    }
  }
}
