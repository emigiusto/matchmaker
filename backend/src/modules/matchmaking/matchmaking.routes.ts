// matchmaking.routes.ts
// Defines the Express router for matchmaking endpoints.
// Explicit and readable. No auth middleware yet.

import { Router } from 'express';
import { MatchmakingController } from './matchmaking.controller';

const router = Router();


// Visual test endpoint (HTML table)
router.get('/test', MatchmakingController.getSuggestionsHtml);

/**
 * @openapi
 * /matchmaking:
 *   get:
 *     summary: Get matchmaking suggestions for a user and availability
 *     description: Returns matchmaking suggestions for a user and their availability.
 *     tags:
 *       - Matchmaking
 *     parameters:
 *       - in: query
 *         name: userId
 *         required: false
 *         schema:
 *           type: string
 *         description: User ID
 *       - in: query
 *         name: availabilityId
 *         required: false
 *         schema:
 *           type: string
 *         description: Availability ID
 *     responses:
 *       200:
 *         description: Suggestions list
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/MatchSuggestion'
 */
router.get('/', MatchmakingController.getSuggestions);



/**
 * @openapi
 * /matchmaking/all:
 *   get:
 *     summary: Get matchmaking suggestions for all availabilities of a user
 *     description: Returns matchmaking suggestions for all availabilities of a user, grouped by availabilityId.
 *     tags:
 *       - Matchmaking
 *     parameters:
 *       - in: query
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *         description: User ID
 *     responses:
 *       200:
 *         description: Suggestions for all availabilities
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               additionalProperties:
 *                 $ref: '#/components/schemas/MatchmakingResult'
 */
// Get all suggestions for all availabilities of a user
router.get('/all', MatchmakingController.getAllSuggestions);

export default router;
