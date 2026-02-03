// venues.routes.ts
// Defines the Express router for venues endpoints.
// No auth middleware yet. Explicit and readable.

import { Router } from 'express';
import { VenuesController } from './venues.controller';

const router = Router();



/**
 * @openapi
 * /venues:
 *   post:
 *     summary: Create a new venue
 *     description: Creates a new venue.
 *     tags:
 *       - Venues
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/VenueInput'
 *     responses:
 *       201:
 *         description: Venue created
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Venue'
 */
router.post('/', VenuesController.createVenue);



/**
 * @openapi
 * /venues/{id}:
 *   patch:
 *     summary: Partially update a venue
 *     description: Partially updates a venue by its ID.
 *     tags:
 *       - Venues
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Venue ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/VenueInput'
 *     responses:
 *       200:
 *         description: Venue updated
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Venue'
 */
router.patch('/:id', VenuesController.updateVenue);



/**
 * @openapi
 * /venues/{id}:
 *   put:
 *     summary: Fully update a venue
 *     description: Fully updates a venue by its ID.
 *     tags:
 *       - Venues
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Venue ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/VenueInput'
 *     responses:
 *       200:
 *         description: Venue replaced
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Venue'
 */
router.put('/:id', VenuesController.replaceVenue);



/**
 * @openapi
 * /venues/{id}:
 *   delete:
 *     summary: Delete a venue
 *     description: Deletes a venue by its ID.
 *     tags:
 *       - Venues
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Venue ID
 *     responses:
 *       204:
 *         description: Venue deleted
 */
router.delete('/:id', VenuesController.deleteVenue);



/**
 * @openapi
 * /venues:
 *   get:
 *     summary: List venues
 *     description: Retrieves a list of venues.
 *     tags:
 *       - Venues
 *     responses:
 *       200:
 *         description: List of venues
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/Venue'
 */
router.get('/', VenuesController.listVenues);



/**
 * @openapi
 * /venues/{id}:
 *   get:
 *     summary: Get a venue by ID
 *     description: Retrieves a venue by its ID.
 *     tags:
 *       - Venues
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Venue ID
 *     responses:
 *       200:
 *         description: Venue details
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Venue'
 */
router.get('/:id', VenuesController.getVenueById);

export default router;
