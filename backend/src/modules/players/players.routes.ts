// players.routes.ts
// -----------------
// Express router for Player endpoints
// Wires routes to PlayersController methods. No extra middleware.

import { Router } from 'express';
import { PlayersController } from './players.controller';

const router = Router();


// POST / - Create a Player for a User
router.post('/', PlayersController.createPlayer);

// GET / - List all players
router.get('/', PlayersController.listPlayers);

// GET /by-city/:city - List players by city
router.get('/by-city/:city', PlayersController.listPlayersByCity);

// GET /count/by-city/:city - Count players by city
router.get('/count/by-city/:city', PlayersController.countPlayersByCity);

// DELETE /:id - Delete player (soft-delete stub)
router.delete('/:id', PlayersController.deletePlayer);

// GET /:id - Get Player by Player ID
router.get('/:id', PlayersController.getPlayerById);

// GET /by-user/:userId - Get Player by User ID
router.get('/by-user/:userId', PlayersController.getPlayerByUserId);

// PATCH /:id - Update Player (partial)
router.patch('/:id', PlayersController.updatePlayer);

export default router;
