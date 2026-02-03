// availability.routes.ts
// ----------------------
// Express router for Availability endpoints
// Wires routes to AvailabilityController methods. No auth middleware yet.

import { Router } from 'express';
import { AvailabilityController } from './availability.controller';

const router = Router();


// POST / - Create a new availability slot
router.post('/', AvailabilityController.createAvailability);

// GET / - List all availabilities for a user
router.get('/', AvailabilityController.listAvailabilities);

// DELETE /:id - Delete an availability slot
router.delete('/:id', AvailabilityController.deleteAvailability);

// GET /:id - Get a single availability by ID
router.get('/:id', AvailabilityController.getAvailabilityById);

// GET /by-date - List availabilities by date (optionally filtered by userId)
router.get('/by-date', AvailabilityController.listAvailabilitiesByDate);

// GET /count - Count availabilities for a user
router.get('/count', AvailabilityController.countAvailabilitiesByUser);

export default router;
