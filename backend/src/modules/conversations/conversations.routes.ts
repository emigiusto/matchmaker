// conversations.routes.ts
// Express router for chat conversations (minimal, explicit)

import { Router } from 'express';
import { ConversationsController } from './conversations.controller';

const router = Router();



/**
 * @openapi
 * /conversations/{id}:
 *   get:
 *     summary: Get a conversation by ID
 *     description: Retrieves a conversation by its ID.
 *     tags:
 *       - Conversations
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Conversation ID
 *     responses:
 *       200:
 *         description: Conversation details
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Conversation'
 */
router.get('/:id', ConversationsController.getConversationById);



/**
 * @openapi
 * /conversations/match/{matchId}:
 *   post:
 *     summary: Get or create a conversation for a match
 *     description: Gets or creates a conversation for a given match.
 *     tags:
 *       - Conversations
 *     parameters:
 *       - in: path
 *         name: matchId
 *         required: true
 *         schema:
 *           type: string
 *         description: Match ID
 *     responses:
 *       200:
 *         description: Conversation for the match
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Conversation'
 */
router.post('/match/:matchId', ConversationsController.getOrCreateConversationForMatch);

export default router;
