// groups.routes.ts
// Express router for Groups module (invite helpers, not permissions/clubs)

import { Router } from 'express';
import { GroupsController } from './groups.controller';

const router = Router();

// POST /groups - Create a new group
router.post('/', GroupsController.createGroup);

// POST /groups/:id/members - Add a member
router.post('/:id/members', GroupsController.addMember);

// DELETE /groups/:id/members/:userId - Remove a member
router.delete('/:id/members/:userId', GroupsController.removeMember);

// GET /groups?userId= - List groups for a user
router.get('/', GroupsController.listGroupsForUser);

export default router;
