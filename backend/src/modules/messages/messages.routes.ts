// messages.routes.ts
// Express router for chat messages (minimal, explicit)

import { Router } from 'express';
import { MessagesController } from './messages.controller';

const router = Router();

// POST /messages - Send a new message
router.post('/', MessagesController.createMessage);

// GET /messages - List messages for a conversation
router.get('/', MessagesController.listMessages);

export default router;
