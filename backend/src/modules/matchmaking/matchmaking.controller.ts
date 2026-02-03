// matchmaking.controller.ts
// Read-only API controller for matchmaking suggestions.
//
// Expected frontend usage:
//   - GET /matchmaking?userId=...&availabilityId=...
//     → Returns ranked, explainable suggestions for who to play with for a given user and availability.
//
// No auth logic, no side effects, no caching (yet).

import { Request, Response, NextFunction } from 'express';
import * as MatchmakingService from './matchmaking.service';

export class MatchmakingController {
  /**
   * GET /matchmaking?userId=&availabilityId=
   * Returns ranked, explainable suggestions for a user and availability.
   */
  static async getSuggestions(req: Request, res: Response, next: NextFunction) {
    try {
      const { userId, availabilityId } = req.query;
      if (!userId || typeof userId !== 'string') {
        return res.status(400).json({ error: 'Missing or invalid userId' });
      }
      if (!availabilityId || typeof availabilityId !== 'string') {
        return res.status(400).json({ error: 'Missing or invalid availabilityId' });
      }
      const result = await MatchmakingService.findMatchCandidates(userId, availabilityId);
      return res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  }
}
