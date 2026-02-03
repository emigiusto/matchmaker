// venues.controller.ts
// HTTP layer for venues (CRUD, no permissions yet)

import { Request, Response, NextFunction } from 'express';
import * as VenuesService from './venues.service';
import { createVenueSchema, venueIdParamSchema, venueFiltersSchema } from './venues.validators';

export class VenuesController {
  /**
   * POST /venues
   * Create a new venue
   */
  static async createVenue(req: Request, res: Response, next: NextFunction) {
    try {
      const parsed = createVenueSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: 'Invalid request body', details: parsed.error.issues });
      }
      const venue = await VenuesService.createVenue(parsed.data);
      return res.status(201).json(venue);
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /venues
   * List venues (optionally filtered by city/surface)
   */
  static async listVenues(req: Request, res: Response, next: NextFunction) {
    try {
      const parsed = venueFiltersSchema.safeParse(req.query);
      if (!parsed.success) {
        return res.status(400).json({ error: 'Invalid filters', details: parsed.error.issues });
      }
      const venues = await VenuesService.listVenues(parsed.data);
      return res.status(200).json(venues);
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /venues/:id
   * Get a venue by ID
   */
  static async getVenueById(req: Request, res: Response, next: NextFunction) {
    try {
      const parsed = venueIdParamSchema.safeParse(req.params);
      if (!parsed.success) {
        return res.status(400).json({ error: 'Invalid venue id', details: parsed.error.issues });
      }
      const venue = await VenuesService.getVenueById(parsed.data.id);
      if (!venue) return res.status(404).json({ error: 'Venue not found' });
      return res.status(200).json(venue);
    } catch (error) {
      next(error);
    }
  }
  /**
   * PATCH /venues/:id
   * Partially update a venue
   */
  static async updateVenue(req: Request, res: Response, next: NextFunction) {
    try {
      const idParsed = venueIdParamSchema.safeParse(req.params);
      if (!idParsed.success) {
        return res.status(400).json({ error: 'Invalid venue id', details: idParsed.error.issues });
      }
      // Accept partial fields for PATCH
      const patchSchema = createVenueSchema.partial();
      const bodyParsed = patchSchema.safeParse(req.body);
      if (!bodyParsed.success) {
        return res.status(400).json({ error: 'Invalid request body', details: bodyParsed.error.issues });
      }
      const venue = await VenuesService.updateVenue(idParsed.data.id, bodyParsed.data);
      if (!venue) return res.status(404).json({ error: 'Venue not found' });
      return res.status(200).json(venue);
    } catch (error) {
      next(error);
    }
  }

  /**
   * PUT /venues/:id
   * Fully replace a venue
   */
  static async replaceVenue(req: Request, res: Response, next: NextFunction) {
    try {
      const idParsed = venueIdParamSchema.safeParse(req.params);
      if (!idParsed.success) {
        return res.status(400).json({ error: 'Invalid venue id', details: idParsed.error.issues });
      }
      const bodyParsed = createVenueSchema.safeParse(req.body);
      if (!bodyParsed.success) {
        return res.status(400).json({ error: 'Invalid request body', details: bodyParsed.error.issues });
      }
      const venue = await VenuesService.replaceVenue(idParsed.data.id, bodyParsed.data);
      if (!venue) return res.status(404).json({ error: 'Venue not found' });
      return res.status(200).json(venue);
    } catch (error) {
      next(error);
    }
  }

  /**
   * DELETE /venues/:id
   * Delete a venue
   */
  static async deleteVenue(req: Request, res: Response, next: NextFunction) {
    try {
      const idParsed = venueIdParamSchema.safeParse(req.params);
      if (!idParsed.success) {
        return res.status(400).json({ error: 'Invalid venue id', details: idParsed.error.issues });
      }
      const deleted = await VenuesService.deleteVenue(idParsed.data.id);
      if (!deleted) return res.status(404).json({ error: 'Venue not found' });
      return res.status(204).send();
    } catch (error) {
      next(error);
    }
  }
}
