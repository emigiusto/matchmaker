// players.routes.ts
// -----------------
// Express router for Player endpoints
// Wires routes to PlayersController methods. No extra middleware.

import { Router } from 'express';
import { PlayersController } from './players.controller';

const router = Router();




/**
 * @openapi
 * /players:
 *   post:
 *     summary: Create a Player for a User
 *     description: Creates a new player for a user.
 *     tags:
 *       - Players
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/PlayerInput'
 *     responses:
 *       201:
 *         description: Player created
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Player'
 */
router.post('/', PlayersController.createPlayer);



/**
 * @openapi
 * /players:
 *   get:
 *     summary: List all players
 *     description: Retrieves all players.
 *     tags:
 *       - Players
 *     responses:
 *       200:
 *         description: List of players
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/Player'
 */
router.get('/', PlayersController.listPlayers);



/**
 * @openapi
 * /players/by-city/{city}:
 *   get:
 *     summary: List players by city
 *     description: Retrieves all players in a given city.
 *     tags:
 *       - Players
 *     parameters:
 *       - in: path
 *         name: city
 *         required: true
 *         schema:
 *           type: string
 *         description: City name
 *     responses:
 *       200:
 *         description: List of players by city
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/Player'
 */
router.get('/by-city/:city', PlayersController.listPlayersByCity);



/**
 * @openapi
 * /players/count/by-city/{city}:
 *   get:
 *     summary: Count players by city
 *     description: Returns the number of players in a given city.
 *     tags:
 *       - Players
 *     parameters:
 *       - in: path
 *         name: city
 *         required: true
 *         schema:
 *           type: string
 *         description: City name
 *     responses:
 *       200:
 *         description: Player count by city
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 count:
 *                   type: integer
 *                   description: Number of players in the city
 */
router.get('/count/by-city/:city', PlayersController.countPlayersByCity);



/**
 * @openapi
 * /players/{id}:
 *   delete:
 *     summary: Delete player (soft-delete stub)
 *     description: Deletes a player by their ID (soft-delete).
 *     tags:
 *       - Players
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Player ID
 *     responses:
 *       204:
 *         description: Player deleted
 */
router.delete('/:id', PlayersController.deletePlayer);



/**
 * @openapi
 * /players/{id}:
 *   get:
 *     summary: Get Player by Player ID
 *     description: Retrieves a player by their Player ID.
 *     tags:
 *       - Players
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Player ID
 *     responses:
 *       200:
 *         description: Player details
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Player'
 */
router.get('/:id', PlayersController.getPlayerById);



/**
 * @openapi
 * /players/by-user/{userId}:
 *   get:
 *     summary: Get Player by User ID
 *     description: Retrieves a player by their User ID.
 *     tags:
 *       - Players
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *         description: User ID
 *     responses:
 *       200:
 *         description: Player details by user
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Player'
 */
router.get('/by-user/:userId', PlayersController.getPlayerByUserId);



/**
 * @openapi
 * /players/{id}:
 *   patch:
 *     summary: Update Player (partial)
 *     description: Partially updates a player by their ID.
 *     tags:
 *       - Players
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Player ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/PlayerInput'
 *     responses:
 *       200:
 *         description: Player updated
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Player'
 */
router.patch('/:id', PlayersController.updatePlayer);

export default router;
