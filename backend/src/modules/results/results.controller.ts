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

export class ResultsController {
  /**
   * POST /results
   * Create a result for a match
   */
  static async createResult(req: Request, res: Response, next: NextFunction) {
    try {
      const parsed = createResultSchema.parse(req.body);
      const result = await ResultsService.createResult(parsed.matchId, parsed.winnerPlayerId);
      res.status(201).json(result);
    } catch (error: any) {
      if (error.status === 409) {
        res.status(409).json({ error: error.message });
      } else {
        next(error);
      }
    }
  }

  /**
   * POST /results/:id/sets
   * Add a set result to a result
   */
  static async addSetResult(req: Request, res: Response, next: NextFunction) {
    try {
      const { resultId } = resultIdParamSchema.parse(req.params);
      const setData = addSetResultSchema.parse(req.body);
      const set = await ResultsService.addSetResult(resultId, setData);
      res.status(201).json(set);
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
      const { matchId } = matchIdParamSchema.parse(req.params);
      const result = await ResultsService.getResultByMatch(matchId);
      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  }
}
