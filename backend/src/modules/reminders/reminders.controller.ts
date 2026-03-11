// reminders.controller.ts
// HTTP layer for reminders.

import { Request, Response, NextFunction } from 'express';
import * as RemindersService from './reminders.service';
import { z } from 'zod';

const createReminderSchema = z.object({
  userId: z.string().uuid(),
  matchId: z.string().uuid(),
  scheduledAt: z.string().datetime(),
});

export class RemindersController {
  /**
   * POST /reminders
   * Create a reminder for a match
   */
  static async create(req: Request, res: Response, next: NextFunction) {
    try {
      const body = createReminderSchema.parse(req.body);
      const reminder = await RemindersService.createReminder(body);
      res.status(201).json(reminder);
    } catch (err) {
      next(err);
    }
  }

  /**
   * GET /reminders?userId=...
   * List reminders for a user
   */
  static async listByUser(req: Request, res: Response, next: NextFunction) {
    try {
      const { userId } = req.query;
      if (!userId || typeof userId !== 'string') {
        return res.status(400).json({ error: 'Missing or invalid userId' });
      }
      const reminders = await RemindersService.listRemindersByUser(userId);
      res.json(reminders);
    } catch (err) {
      next(err);
    }
  }
}
