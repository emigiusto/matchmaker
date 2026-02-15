// availability.controller.ts
// --------------------------
// HTTP layer for Availability endpoints
// Maps HTTP requests to AvailabilityService methods. No business logic here.

import { Request, Response, NextFunction } from 'express';
import { AvailabilityService } from './availability.service';
import {
  createAvailabilitySchema,
  availabilityIdParamSchema,
  listAvailabilitiesQuerySchema,
} from './availability.validators';

// Expected frontend usage:
// - POST /availability: Create a new availability slot
// - GET /availability?userId=: List all availabilities for a user
// - DELETE /availability/:id: Delete an availability slot

export class AvailabilityController {
  /**
   * POST /availability
   * Create a new availability slot
   */
  static async createAvailability(req: Request, res: Response, next: NextFunction) {
    try {
      const parsed = createAvailabilitySchema.parse(req.body);
      const availability = await AvailabilityService.createAvailability(parsed.userId, parsed);
      res.status(201).json(availability);
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /availability/:id
   * Get a single availability by ID
   */
  static async getAvailabilityById(req: Request, res: Response, next: NextFunction) {
    try {
      const { availabilityId } = availabilityIdParamSchema.parse({ availabilityId: req.params.id });
      const availability = await AvailabilityService.getAvailabilityById(availabilityId);
      if (!availability) return res.status(404).json({ error: 'Availability not found' });
      res.json(availability);
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /availability/by-date?date=YYYY-MM-DD&userId=
   * List availabilities by date (optionally filtered by userId)
   */
  static async listAvailabilitiesByDate(req: Request, res: Response, next: NextFunction) {
    try {
      const { date, userId } = listAvailabilitiesQuerySchema.parse(req.query);
      if (!date) return res.status(400).json({ error: 'date is required' });
      const availabilities = await AvailabilityService.listAvailabilitiesByDate(date, userId);
      res.json(availabilities);
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /availability/count?userId=
   * Count availabilities for a user
   */
  static async countAvailabilitiesByUser(req: Request, res: Response, next: NextFunction) {
    try {
      const { userId } = listAvailabilitiesQuerySchema.parse(req.query);
      if (!userId) return res.status(400).json({ error: 'userId is required' });
      const count = await AvailabilityService.countAvailabilitiesByUser(userId);
      res.json({ userId, count });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /availability?userId=
   * List all availabilities for a user
   */
  static async listAvailabilities(req: Request, res: Response, next: NextFunction) {
    try {
      const parsed = listAvailabilitiesQuerySchema.parse(req.query);
      if (!parsed.userId) {
        return res.status(400).json({ error: 'userId is required' });
      }
      const availabilities = await AvailabilityService.listAvailabilitiesByUser(parsed.userId);
      res.json(availabilities);
    } catch (error) {
      next(error);
    }
  }

  /**
   * DELETE /availability/:id
   * Delete an availability slot
   */
  static async deleteAvailability(req: Request, res: Response, next: NextFunction) {
    try {
      const { availabilityId } = availabilityIdParamSchema.parse({ availabilityId: req.params.id });
      await AvailabilityService.deleteAvailability(availabilityId);
      res.status(204).send();
    } catch (error) {
      next(error);
    }
  }
}
