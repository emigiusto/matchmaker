// matches.routes.ts
// Defines the Express router for matches endpoints.
// No auth middleware yet. Routing is explicit and readable.
// No creation or mutation logic: matches are derived and immutable (see Invites module for creation).

import { Router } from 'express';

import { MatchesController } from './matches.controller';
const router = Router();

// Wires routes to MatchesController static methods. No auth middleware.

// Additional useful routes for UI
router.get('/upcoming', MatchesController.listUpcomingMatchesForUser);
router.get('/past', MatchesController.listPastMatchesForUser);
router.get('/for-venue/:venueId', MatchesController.listMatchesForVenue);
router.get('/recent', MatchesController.listRecentMatches);
router.get('/by-player/:playerId', MatchesController.listMatchesForPlayer);
router.get('/:id', MatchesController.getMatchById);
router.get('/', MatchesController.listMatchesForUser);

export default router;
