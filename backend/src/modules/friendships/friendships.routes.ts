// friendships.routes.ts
// ---------------------
// Express router for Friendships endpoints
// Wires routes to FriendshipsController methods. No auth middleware yet.

import { Router } from 'express';
import { FriendshipsController } from './friendships.controller';

const router = Router();


// POST /user - Add a registered user as a friend
router.post('/user', FriendshipsController.addUserFriend);

// POST /guest - Add a guest contact as a friend
router.post('/guest', FriendshipsController.addGuestContactFriend);

// DELETE /:id - Remove a friendship by ID
router.delete('/:id', FriendshipsController.removeFriend);

// GET / - List all friends for a user
router.get('/', FriendshipsController.listFriends);

export default router;
