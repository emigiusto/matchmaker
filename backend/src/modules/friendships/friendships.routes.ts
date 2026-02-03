// friendships.routes.ts
// ---------------------
// Express router for Friendships endpoints
// Wires routes to FriendshipsController methods. No auth middleware yet.

import { Router } from 'express';
import { FriendshipsController } from './friendships.controller';

const router = Router();




/**
 * @openapi
 * /friendships/user:
 *   post:
 *     summary: Add a registered user as a friend
 *     description: Adds a registered user as a friend.
 *     tags:
 *       - Friendships
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/FriendshipInput'
 *     responses:
 *       201:
 *         description: Friend added
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Friendship'
 *       400:
 *         description: Invalid input
 *       409:
 *         description: Already friends
 */
router.post('/user', FriendshipsController.addUserFriend);



/**
 * @openapi
 * /friendships/guest:
 *   post:
 *     summary: Add a guest contact as a friend
 *     description: Adds a guest contact as a friend.
 *     tags:
 *       - Friendships
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/FriendshipInput'
 *     responses:
 *       201:
 *         description: Guest friend added
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Friendship'
 *       400:
 *         description: Invalid input
 */
router.post('/guest', FriendshipsController.addGuestContactFriend);



/**
 * @openapi
 * /friendships/{id}:
 *   delete:
 *     summary: Remove a friendship by ID
 *     description: Removes a friendship by its ID.
 *     tags:
 *       - Friendships
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Friendship ID
 *     responses:
 *       204:
 *         description: Friendship removed
 *       404:
 *         description: Friendship not found
 */
router.delete('/:id', FriendshipsController.removeFriend);


/**
 * @openapi
 * /friendships:
 *   get:
 *     summary: List all friends for a user
 *     tags:
 *       - Friendships
 *     parameters:
 *       - in: query
 *         name: userId
 *         required: false
 *         schema:
 *           type: string
 *         description: User ID to list friends for
 *     responses:
 *       200:
 *         description: List of friends
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/Friendship'
 */
router.get('/', FriendshipsController.listFriends);


/**
 * @openapi
 * /friendships/{id}:
 *   get:
 *     summary: Get a specific friendship by ID
 *     tags:
 *       - Friendships
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Friendship ID
 *     responses:
 *       200:
 *         description: Friendship details
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Friendship'
 *       404:
 *         description: Friendship not found
 */
router.get('/:id', FriendshipsController.getFriendshipById);


/**
 * @openapi
 * /friendships/mutual:
 *   get:
 *     summary: List mutual friends between two users
 *     tags:
 *       - Friendships
 *     parameters:
 *       - in: query
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *         description: First user ID
 *       - in: query
 *         name: otherUserId
 *         required: true
 *         schema:
 *           type: string
 *         description: Second user ID
 *     responses:
 *       200:
 *         description: List of mutual friends
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/Friendship'
 */
router.get('/mutual', FriendshipsController.listMutualFriends);


/**
 * @openapi
 * /friendships/requests:
 *   get:
 *     summary: List incoming/outgoing friend requests
 *     tags:
 *       - Friendships
 *     parameters:
 *       - in: query
 *         name: userId
 *         required: false
 *         schema:
 *           type: string
 *         description: User ID to list requests for
 *     responses:
 *       200:
 *         description: List of friend requests
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/Friendship'
 */
router.get('/requests', FriendshipsController.listFriendRequests);


/**
 * @openapi
 * /friendships/is-friend:
 *   get:
 *     summary: Check if two users are friends
 *     tags:
 *       - Friendships
 *     parameters:
 *       - in: query
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *         description: First user ID
 *       - in: query
 *         name: otherUserId
 *         required: true
 *         schema:
 *           type: string
 *         description: Second user ID
 *     responses:
 *       200:
 *         description: Friendship status
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 areFriends:
 *                   type: boolean
 *                   description: Whether the users are friends
 */
router.get('/is-friend', FriendshipsController.isFriend);


/**
 * @openapi
 * /friendships/count:
 *   get:
 *     summary: Get friend count for a user
 *     tags:
 *       - Friendships
 *     parameters:
 *       - in: query
 *         name: userId
 *         required: false
 *         schema:
 *           type: string
 *         description: User ID to count friends for
 *     responses:
 *       200:
 *         description: Friend count
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 count:
 *                   type: integer
 *                   description: Number of friends
 */
router.get('/count', FriendshipsController.countFriends);

export default router;
