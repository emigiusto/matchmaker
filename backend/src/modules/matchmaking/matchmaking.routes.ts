// matchmaking.routes.ts
// Defines the Express router for matchmaking endpoints.
// Explicit and readable. No auth middleware yet.

import { Router } from 'express';
import { MatchmakingController } from './matchmaking.controller';

const router = Router();



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

export default router;
