// venues.routes.ts
// Defines the Express router for venues endpoints.
// No auth middleware yet. Explicit and readable.

import { Router } from 'express';
import { VenuesController } from './venues.controller';

const router = Router();

// POST /venues - Create a new venue
router.post('/', VenuesController.createVenue);

// PATCH /venues/:id - Partially update a venue
router.patch('/:id', VenuesController.updateVenue);

// PUT /venues/:id - Fully update a venue
router.put('/:id', VenuesController.replaceVenue);

// DELETE /venues/:id - Delete a venue
router.delete('/:id', VenuesController.deleteVenue);

// GET /venues - List venues (optionally filtered)
router.get('/', VenuesController.listVenues);

// GET /venues/:id - Get a venue by ID
router.get('/:id', VenuesController.getVenueById);

export default router;
