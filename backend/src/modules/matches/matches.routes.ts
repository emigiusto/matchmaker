// matches.routes.ts
// Defines the Express router for matches endpoints.
// No auth middleware yet. Routing is explicit and readable.
// No creation or mutation logic: matches are derived and immutable (see Invites module for creation).

import { Router } from 'express';

import { MatchesController } from './matches.controller';

const router = Router();


// Wires routes to MatchesController static methods. No auth middleware.
router.get('/:id', MatchesController.getMatchById);
router.get('/', MatchesController.listMatchesForUser);
router.get('/by-player/:playerId', MatchesController.listMatchesForPlayer);

export default router;
