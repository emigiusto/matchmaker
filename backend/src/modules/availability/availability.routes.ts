// availability.routes.ts
// ----------------------
// Express router for Availability endpoints
// Wires routes to AvailabilityController methods. No auth middleware yet.

import { Router } from 'express';
import { AvailabilityController } from './availability.controller';

const router = Router();
/**
 * @openapi
 * /availability:
 *   post:
 *     summary: Create a new availability slot
 *     description: Creates a new availability slot for a user.
 *     tags:
 *       - Availability
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/AvailabilityInput'
 *     responses:
 *       201:
 *         description: The created availability
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Availability'
 */
router.post('/', AvailabilityController.createAvailability);

/**
 * @openapi
 * /availability:
 *   get:
 *     summary: List all availabilities for a user
 *     description: Retrieves all availability slots for a user.
 *     tags:
 *       - Availability
 *     responses:
 *       200:
 *         description: List of availabilities
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/Availability'
 */
router.get('/', AvailabilityController.listAvailabilities);

/**
 * @openapi
 * /availability/{id}:
 *   delete:
 *     summary: Delete an availability slot
 *     description: Deletes an availability slot by its ID.
 *     tags:
 *       - Availability
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Availability ID
 *     responses:
 *       204:
 *         description: Availability deleted
 */
router.delete('/:id', AvailabilityController.deleteAvailability);

/**
 * @openapi
 * /availability/{id}:
 *   get:
 *     summary: Get a single availability by ID
 *     description: Retrieves a single availability slot by its ID.
 *     tags:
 *       - Availability
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Availability ID
 *     responses:
 *       200:
 *         description: Availability details
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Availability'
 */
router.get('/:id', AvailabilityController.getAvailabilityById);

/**
 * @openapi
 * /availability/by-date:
 *   get:
 *     summary: List availabilities by date (optionally filtered by userId)
 *     description: Retrieves availabilities for a specific date, optionally filtered by userId.
 *     tags:
 *       - Availability
 *     parameters:
 *       - in: query
 *         name: userId
 *         required: false
 *         schema:
 *           type: string
 *         description: User ID
 *     responses:
 *       200:
 *         description: List of availabilities by date
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/Availability'
 */
router.get('/by-date', AvailabilityController.listAvailabilitiesByDate);

/**
 * @openapi
 * /availability/count:
 *   get:
 *     summary: Count availabilities for a user
 *     description: Returns the count of availabilities for a user.
 *     tags:
 *       - Availability
 *     parameters:
 *       - in: query
 *         name: userId
 *         required: false
 *         schema:
 *           type: string
 *         description: User ID
 *     responses:
 *       200:
 *         description: Availability count
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 count:
 *                   type: integer
 *                   description: Number of availabilities
 */
router.get('/count', AvailabilityController.countAvailabilitiesByUser);

export default router;
