// results.routes.ts
// Defines the Express router for results endpoints.
// No auth middleware. Routing is explicit and readable.

import { Router } from 'express';
import { ResultsController } from './results.controller';

const router = Router();

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
 * /results/{id}/confirm:
 *   post:
 *     summary: Confirm a submitted result
 *     description: Confirms a submitted result. Only host or opponent can confirm. Cannot confirm if already confirmed.
 *     tags:
 *       - Results
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Result ID
 *     responses:
 *       200:
 *         description: The confirmed result
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Result'
 *       401:
 *         description: Unauthorized
 *       409:
 *         description: Result already confirmed
 */
router.post('/:id/confirm', ResultsController.confirmResult);

/**
 * @openapi
 * /results/{id}/dispute:
 *   post:
 *     summary: Dispute a result
 *     description: Disputes a result. Only host or opponent can dispute. Cannot dispute if already confirmed.
 *     tags:
 *       - Results
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Result ID
 *     responses:
 *       200:
 *         description: The disputed result
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Result'
 *       401:
 *         description: Unauthorized
 *       409:
 *         description: Cannot dispute a confirmed result
 */
router.post('/:id/dispute', ResultsController.disputeResult);

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

/**
 * @openapi
 * /results/{matchId}/submit-result:
 *   post:
 *     summary: Submit match result and sets
 *     description: Unified endpoint to submit result and sets for a match.
 *     tags:
 *       - Results
 *     parameters:
 *       - in: path
 *         name: matchId
 *         required: true
 *         schema:
 *           type: string
 *         description: Match ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               winnerUserId:
 *                 type: string
 *                 nullable: true
 *               sets:
 *                 type: array
 *                 items:
 *                   $ref: '#/components/schemas/SetResultInput'
 *     responses:
 *       201:
 *         description: The submitted match result
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Result'
 */
router.post('/:matchId/submit-result', ResultsController.submitMatchResult);

export default router;
