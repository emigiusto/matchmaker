// invite.routes.ts
// ---------------
// Express router for Invite endpoints
// Wires routes to InviteController methods. No auth middleware.

import { Router } from 'express';
import { InviteController } from './invite.controller';

const router = Router();


// POST / - Create a new invite
router.post('/', InviteController.createInvite);

// GET /:token - Fetch invite details by token
router.get('/:token', InviteController.getInviteByToken);

// POST /:token/confirm - Confirm invite by token
router.post('/:token/confirm', InviteController.confirmInvite);

// POST /:token/decline - Decline invite by token
router.post('/:token/decline', InviteController.declineInvite);

export default router;
