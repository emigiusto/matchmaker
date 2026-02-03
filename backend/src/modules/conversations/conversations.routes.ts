// conversations.routes.ts
// Express router for chat conversations (minimal, explicit)

import { Router } from 'express';
import { ConversationsController } from './conversations.controller';

const router = Router();

// GET /conversations/:id - Fetch a conversation by ID
router.get('/:id', ConversationsController.getConversationById);

// POST /conversations/match/:matchId - Get or create a conversation for a match
router.post('/match/:matchId', ConversationsController.getOrCreateConversationForMatch);

export default router;
