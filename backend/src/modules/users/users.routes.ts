// users.routes.ts
// Express routes for User identity/contact info only.

import { Router } from 'express';
import { createGuestUserController, createUserController, findUserByIdController, updateUserController, deleteUserController, findAllUsersController } from './users.controller';

const router = Router();

// Guest-first: create guest user (no Player)
router.post('/guest', createGuestUserController);

// Create non-guest user
router.post('/', createUserController);

// Get all users
router.get('/', findAllUsersController);

// Get user by id
router.get('/:id', findUserByIdController);

// Update user
router.put('/:id', updateUserController);

// Delete user
router.delete('/:id', deleteUserController);

export default router;
