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

// GET /by-id/:id - Get invite by ID
router.get('/by-id/:id', InviteController.getInviteById);

// GET /by-user/:userId - List all invites sent or received by a user
router.get('/by-user/:userId', InviteController.listInvitesByUser);

// GET /by-availability/:availabilityId - List all invites for an availability
router.get('/by-availability/:availabilityId', InviteController.listInvitesByAvailability);

// GET /count/:userId - Count invites for a user
router.get('/count/:userId', InviteController.countInvitesByUser);

export default router;
