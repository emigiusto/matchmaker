// results.routes.ts
// Defines the Express router for results endpoints.
// No auth middleware. Routing is explicit and readable.

import { Router } from 'express';
import { ResultsController } from './results.controller';

const router = Router();

// POST /results - Create a result for a match
router.post('/', ResultsController.createResult);

// POST /results/:id/sets - Add a set result to a result
router.post('/:id/sets', ResultsController.addSetResult);

// GET /results/by-match/:matchId - Fetch result for a match
router.get('/by-match/:matchId', ResultsController.getResultByMatch);

// GET /results/by-player/:playerId - Fetch all results for a player
router.get('/by-player/:playerId', ResultsController.getResultsByPlayer);

// GET /results/by-user/:userId - Fetch all results for a user
router.get('/by-user/:userId', ResultsController.getResultsByUser);

// GET /results/recent?limit=10 - Fetch recent results
router.get('/recent', ResultsController.getRecentResults);

export default router;
