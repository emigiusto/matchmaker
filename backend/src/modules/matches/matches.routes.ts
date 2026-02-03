// matches.routes.ts
// Defines the Express router for matches endpoints.
// No auth middleware yet. Routing is explicit and readable.
// No creation or mutation logic: matches are derived and immutable (see Invites module for creation).

import { Router } from 'express';

import { MatchesController } from './matches.controller';
const router = Router();

// Wires routes to MatchesController static methods. No auth middleware.



/**
 * @openapi
 * /matches/upcoming:
 *   get:
 *     summary: List upcoming matches for a user
 *     description: Retrieves a list of upcoming matches for the authenticated user.
 *     tags:
 *       - Matches
 *     responses:
 *       200:
 *         description: Upcoming matches
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/Match'
 *       401:
 *         description: Unauthorized
 */
router.get('/upcoming', MatchesController.listUpcomingMatchesForUser);


/**
 * @openapi
 * /matches/past:
 *   get:
 *     summary: List past matches for a user
 *     description: Retrieves a list of past matches for the authenticated user.
 *     tags:
 *       - Matches
 *     responses:
 *       200:
 *         description: Past matches
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/Match'
 *       401:
 *         description: Unauthorized
 */
router.get('/past', MatchesController.listPastMatchesForUser);

/**
 * @openapi
 * /matches/for-venue/{venueId}:
 *   get:
 *     summary: List matches for a venue
 *     tags:
 *       - Matches
 *     parameters:
 *       - in: path
 *         name: venueId
 *         required: true
 *         schema:
 *           type: string
 *         description: Venue ID
 *     responses:
 *       200:
 *         description: Matches for venue
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/Match'
 *       404:
 *         description: Venue not found
 */
router.get('/for-venue/:venueId', MatchesController.listMatchesForVenue);

/**
 * @openapi
 * /matches/recent:
 *   get:
 *     summary: List recent matches
 *     tags:
 *       - Matches
 *     responses:
 *       200:
 *         description: Recent matches
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/Match'
 */
router.get('/recent', MatchesController.listRecentMatches);

/**
 * @openapi
 * /matches/by-player/{playerId}:
 *   get:
 *     summary: List matches for a player
 *     tags:
 *       - Matches
 *     parameters:
 *       - in: path
 *         name: playerId
 *         required: true
 *         schema:
 *           type: string
 *         description: Player ID
 *     responses:
 *       200:
 *         description: Matches for player
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/Match'
 *       404:
 *         description: Player not found
 */
router.get('/by-player/:playerId', MatchesController.listMatchesForPlayer);

/**
 * @openapi
 * /matches/{id}:
 *   get:
 *     summary: Get match by ID
 *     tags:
 *       - Matches
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Match ID
 *     responses:
 *       200:
 *         description: Match details
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Match'
 *       404:
 *         description: Match not found
 */
router.get('/:id', MatchesController.getMatchById);

/**
 * @openapi
 * /matches:
 *   get:
 *     summary: List matches for a user
 *     tags:
 *       - Matches
 *     responses:
 *       200:
 *         description: List of matches
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/Match'
 *       401:
 *         description: Unauthorized
 */
router.get('/', MatchesController.listMatchesForUser);

export default router;
