// players.routes.ts
// -----------------
// Express router for Player endpoints
// Wires routes to PlayersController methods. No extra middleware.

import { Router } from 'express';
import { PlayersController } from './players.controller';

const router = Router();


// POST / - Create a Player for a User
router.post('/', PlayersController.createPlayer);

// GET /:id - Get Player by Player ID
router.get('/:id', PlayersController.getPlayerById);

// GET /by-user/:userId - Get Player by User ID
router.get('/by-user/:userId', PlayersController.getPlayerByUserId);

// PATCH /:id - Update Player (partial)
router.patch('/:id', PlayersController.updatePlayer);

export default router;
