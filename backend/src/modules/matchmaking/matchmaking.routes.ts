// matchmaking.routes.ts
// Defines the Express router for matchmaking endpoints.
// Explicit and readable. No auth middleware yet.

import { Router } from 'express';
import { MatchmakingController } from './matchmaking.controller';

const router = Router();

// GET /matchmaking - Get suggestions for a user and availability
router.get('/', MatchmakingController.getSuggestions);

export default router;
