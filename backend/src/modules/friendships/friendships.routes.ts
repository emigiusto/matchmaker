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

// GET /:id - Get a specific friendship by ID
router.get('/:id', FriendshipsController.getFriendshipById);

// GET /mutual?userId=...&otherUserId=... - List mutual friends between two users
router.get('/mutual', FriendshipsController.listMutualFriends);

// GET /requests?userId=... - List incoming/outgoing friend requests (future extension)
router.get('/requests', FriendshipsController.listFriendRequests);

// GET /is-friend?userId=...&otherUserId=... - Check if two users are friends
router.get('/is-friend', FriendshipsController.isFriend);

// GET /count?userId=... - Get friend count for a user
router.get('/count', FriendshipsController.countFriends);

export default router;
