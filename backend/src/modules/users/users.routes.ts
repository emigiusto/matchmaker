// users.routes.ts
// Express routes for User identity/contact info only.

import { Router } from 'express';
import { createGuestUserController, createUserController, findUserByIdController, updateUserController, deleteUserController, findAllUsersController } from './users.controller';

const router = Router();



/**
 * @openapi
 * /users/guest:
 *   post:
 *     summary: Create a guest user (no Player)
 *     description: Creates a guest user (no Player).
 *     tags:
 *       - Users
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/UserInput'
 *     responses:
 *       201:
 *         description: Guest user created
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/User'
 */
router.post('/guest', createGuestUserController);



/**
 * @openapi
 * /users:
 *   post:
 *     summary: Create a non-guest user
 *     description: Creates a non-guest user.
 *     tags:
 *       - Users
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/UserInput'
 *     responses:
 *       201:
 *         description: User created
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/User'
 */
router.post('/', createUserController);



/**
 * @openapi
 * /users:
 *   get:
 *     summary: Get all users
 *     description: Retrieves all users in the system.
 *     tags:
 *       - Users
 *     responses:
 *       200:
 *         description: List of users
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/User'
 */
router.get('/', findAllUsersController);



/**
 * @openapi
 * /users/{id}:
 *   get:
 *     summary: Get user by id
 *     description: Retrieves a user by their ID.
 *     tags:
 *       - Users
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: User ID
 *     responses:
 *       200:
 *         description: User details
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/User'
 */
router.get('/:id', findUserByIdController);



/**
 * @openapi
 * /users/{id}:
 *   put:
 *     summary: Update user
 *     description: Updates a user by their ID.
 *     tags:
 *       - Users
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: User ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/UserInput'
 *     responses:
 *       200:
 *         description: User updated
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/User'
 */
router.put('/:id', updateUserController);



/**
 * @openapi
 * /users/{id}:
 *   delete:
 *     summary: Delete user
 *     description: Deletes a user by their ID.
 *     tags:
 *       - Users
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: User ID
 *     responses:
 *       204:
 *         description: User deleted
 */
router.delete('/:id', deleteUserController);

export default router;
