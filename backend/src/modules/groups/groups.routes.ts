// groups.routes.ts
// Express router for Groups module (invite helpers, not permissions/clubs)

import { Router } from 'express';
import { GroupsController } from './groups.controller';

const router = Router();



/**
 * @openapi
 * /groups:
 *   post:
 *     summary: Create a new group
 *     description: Creates a new group.
 *     tags:
 *       - Groups
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/GroupInput'
 *     responses:
 *       201:
 *         description: Group created
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Group'
 *       400:
 *         description: Invalid input
 */
router.post('/', GroupsController.createGroup);


/**
 * @openapi
 * /groups/{id}/members:
 *   post:
 *     summary: Add a member to a group
 *     tags:
 *       - Groups
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Group ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               userId:
 *                 type: string
 *                 description: User ID to add
 *             required:
 *               - userId
 *     responses:
 *       200:
 *         description: Member added
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Group'
 *       404:
 *         description: Group not found
 */
router.post('/:id/members', GroupsController.addMember);


/**
 * @openapi
 * /groups/{id}/members/{userId}:
 *   delete:
 *     summary: Remove a member from a group
 *     tags:
 *       - Groups
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Group ID
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *         description: User ID to remove
 *     responses:
 *       200:
 *         description: Member removed
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Group'
 *       404:
 *         description: Group or user not found
 */
router.delete('/:id/members/:userId', GroupsController.removeMember);


/**
 * @openapi
 * /groups:
 *   get:
 *     summary: List groups for a user
 *     tags:
 *       - Groups
 *     parameters:
 *       - in: query
 *         name: userId
 *         required: false
 *         schema:
 *           type: string
 *         description: User ID to filter groups
 *     responses:
 *       200:
 *         description: List of groups
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/Group'
 */
router.get('/', GroupsController.listGroupsForUser);

export default router;
