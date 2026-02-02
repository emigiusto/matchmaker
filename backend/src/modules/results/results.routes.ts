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

export default router;
