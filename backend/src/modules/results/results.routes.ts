// results.routes.ts
// Defines the Express router for results endpoints.
// No auth middleware. Routing is explicit and readable.

import { Router } from 'express';
import { ResultsController } from './results.controller';

const router = Router();



// ...existing code with tags, descriptions, and schemas already present...



/**
 * @openapi
 * /results/{id}/sets:
 *   post:
 *     summary: Add a set result to a result
 *     description: Adds a set result to an existing match result.
 *     tags:
 *       - Results
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Result ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/SetResultInput'
 *     responses:
 *       201:
 *         description: The added set result
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SetResult'
 */
router.post('/:id/sets', ResultsController.addSetResult);



/**
 * @openapi
 * /results/by-match/{matchId}:
 *   get:
 *     summary: Fetch result for a match
 *     description: Retrieves the result for a specific match.
 *     tags:
 *       - Results
 *     parameters:
 *       - in: path
 *         name: matchId
 *         required: true
 *         schema:
 *           type: string
 *         description: Match ID
 *     responses:
 *       200:
 *         description: Result for match
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Result'
 */
router.get('/by-match/:matchId', ResultsController.getResultByMatch);



/**
 * @openapi
 * /results/by-player/{playerId}:
 *   get:
 *     summary: Fetch all results for a player
 *     description: Retrieves all results for a specific player.
 *     tags:
 *       - Results
 *     parameters:
 *       - in: path
 *         name: playerId
 *         required: true
 *         schema:
 *           type: string
 *         description: Player ID
 *     responses:
 *       200:
 *         description: Results for player
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/Result'
 */
router.get('/by-player/:playerId', ResultsController.getResultsByPlayer);



/**
 * @openapi
 * /results/by-user/{userId}:
 *   get:
 *     summary: Fetch all results for a user
 *     description: Retrieves all results for a specific user.
 *     tags:
 *       - Results
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *         description: User ID
 *     responses:
 *       200:
 *         description: Results for user
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/Result'
 */
router.get('/by-user/:userId', ResultsController.getResultsByUser);



/**
 * @openapi
 * /results/recent:
 *   get:
 *     summary: Fetch recent results
 *     description: Retrieves a list of recent results.
 *     tags:
 *       - Results
 *     parameters:
 *       - in: query
 *         name: limit
 *         required: false
 *         schema:
 *           type: integer
 *         description: Maximum number of results to return
 *     responses:
 *       200:
 *         description: Recent results
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/Result'
 */
router.get('/recent', ResultsController.getRecentResults);

export default router;
