// invite.routes.ts
// ---------------
// Express router for Invite endpoints
// Wires routes to InviteController methods. No auth middleware.

import { Router } from 'express';
import { InviteController } from './invite.controller';

const router = Router();




/**
 * @openapi
 * /invites:
 *   post:
 *     summary: Create a new invite
 *     description: Creates a new invite for a user or availability.
 *     tags:
 *       - Invites
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/InviteInput'
 *     responses:
 *       201:
 *         description: The created invite
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Invite'
 *       400:
 *         description: Invalid input
 */
router.post('/', InviteController.createInvite);



/**
 * @openapi
 * /invites/{token}:
 *   get:
 *     summary: Fetch invite details by token
 *     description: Retrieves invite details by token.
 *     tags:
 *       - Invites
 *     parameters:
 *       - in: path
 *         name: token
 *         required: true
 *         schema:
 *           type: string
 *         description: Invite token
 *     responses:
 *       200:
 *         description: Invite details
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Invite'
 *       404:
 *         description: Invite not found
 */
router.get('/:token', InviteController.getInviteByToken);


/**
 * @openapi
 * /invites/{token}/confirm:
 *   post:
 *     summary: Confirm invite by token
 *     tags:
 *       - Invites
 *     parameters:
 *       - in: path
 *         name: token
 *         required: true
 *         schema:
 *           type: string
 *         description: Invite token
 *     responses:
 *       200:
 *         description: Invite confirmed
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Invite'
 *       404:
 *         description: Invite not found or already confirmed
 */
router.post('/:token/confirm', InviteController.confirmInvite);


/**
 * @openapi
 * /invites/{token}/decline:
 *   post:
 *     summary: Decline invite by token
 *     tags:
 *       - Invites
 *     parameters:
 *       - in: path
 *         name: token
 *         required: true
 *         schema:
 *           type: string
 *         description: Invite token
 *     responses:
 *       200:
 *         description: Invite declined
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Invite'
 *       404:
 *         description: Invite not found or already declined
 */
router.post('/:token/decline', InviteController.declineInvite);


/**
 * @openapi
 * /invites/by-id/{id}:
 *   get:
 *     summary: Get invite by ID
 *     tags:
 *       - Invites
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Invite ID
 *     responses:
 *       200:
 *         description: Invite details by ID
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Invite'
 *       404:
 *         description: Invite not found
 */
router.get('/by-id/:id', InviteController.getInviteById);


/**
 * @openapi
 * /invites/by-user/{userId}:
 *   get:
 *     summary: List all invites sent or received by a user
 *     tags:
 *       - Invites
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *         description: User ID
 *     responses:
 *       200:
 *         description: List of invites for user
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/Invite'
 */
router.get('/by-user/:userId', InviteController.listInvitesByUser);


/**
 * @openapi
 * /invites/by-availability/{availabilityId}:
 *   get:
 *     summary: List all invites for an availability
 *     tags:
 *       - Invites
 *     parameters:
 *       - in: path
 *         name: availabilityId
 *         required: true
 *         schema:
 *           type: string
 *         description: Availability ID
 *     responses:
 *       200:
 *         description: List of invites for availability
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/Invite'
 */
router.get('/by-availability/:availabilityId', InviteController.listInvitesByAvailability);


/**
 * @openapi
 * /invites/count/{userId}:
 *   get:
 *     summary: Count invites for a user
 *     tags:
 *       - Invites
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *         description: User ID
 *     responses:
 *       200:
 *         description: Invite count for user
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 count:
 *                   type: integer
 *                   description: Number of invites
 */
router.get('/count/:userId', InviteController.countInvitesByUser);

export default router;
