// messages.routes.ts
// Express router for chat messages (minimal, explicit)

import { Router } from 'express';
import { MessagesController } from './messages.controller';

const router = Router();



/**
 * @openapi
 * /messages:
 *   post:
 *     summary: Send a new message
 *     description: Sends a new message in a conversation.
 *     tags:
 *       - Messages
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/MessageInput'
 *     responses:
 *       201:
 *         description: Message sent
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Message'
 */
router.post('/', MessagesController.createMessage);



/**
 * @openapi
 * /messages:
 *   get:
 *     summary: List messages for a conversation
 *     description: Retrieves messages for a conversation.
 *     tags:
 *       - Messages
 *     parameters:
 *       - in: query
 *         name: conversationId
 *         required: false
 *         schema:
 *           type: string
 *         description: Conversation ID
 *     responses:
 *       200:
 *         description: List of messages
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/Message'
 */
router.get('/', MessagesController.listMessages);

export default router;
