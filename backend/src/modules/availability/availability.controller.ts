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
