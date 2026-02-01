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

export default router;
