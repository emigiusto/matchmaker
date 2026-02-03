// notifications.controller.ts
// HTTP layer for notifications. No business logic here.
//
// Expected frontend usage:
// - POST /notifications: Create a notification for a user
// - GET /notifications?userId=...: List notifications for a user
// - POST /notifications/:id/read: Mark a notification as read

import { Request, Response, NextFunction } from 'express';
import * as NotificationsService from './notifications.service';
import { z } from 'zod';

const createNotificationSchema = z.object({
  userId: z.string().uuid(),
  type: z.string(),
  payload: z.unknown(),
});

const userIdQuerySchema = z.object({
  userId: z.string().uuid(),
});

const notificationIdParamSchema = z.object({
  id: z.string().uuid(),
});

export class NotificationsController {
    /**
     * GET /notifications/:id
     * Get notification by ID
     */
    static async getNotificationById(req: Request, res: Response, next: NextFunction) {
      try {
        const { id } = req.params;
        const notification = await NotificationsService.getNotificationById(Array.isArray(id) ? id[0] : id);
        if (!notification) return res.status(404).json({ error: 'Notification not found' });
        res.status(200).json(notification);
      } catch (error) {
        next(error);
      }
    }

    /**
     * GET /notifications/unread?userId=...
     * List unread notifications for a user
     */
    static async listUnreadNotificationsForUser(req: Request, res: Response, next: NextFunction) {
      try {
        const { userId } = userIdQuerySchema.parse(req.query);
        const notifications = await NotificationsService.listUnreadNotificationsForUser(userId);
        res.status(200).json(notifications);
      } catch (error) {
        next(error);
      }
    }

    /**
     * GET /notifications/count?userId=...
     * Count notifications for a user
     */
    static async countNotificationsForUser(req: Request, res: Response, next: NextFunction) {
      try {
        const { userId } = userIdQuerySchema.parse(req.query);
        const count = await NotificationsService.countNotificationsForUser(userId);
        res.status(200).json({ userId, count });
      } catch (error) {
        next(error);
      }
    }

    /**
     * DELETE /notifications/:id
     * Delete a notification by ID
     */
    static async deleteNotification(req: Request, res: Response, next: NextFunction) {
      try {
        const { id } = notificationIdParamSchema.parse(req.params);
        await NotificationsService.deleteNotification(id);
        res.status(204).send();
      } catch (error) {
        next(error);
      }
    }
  /**
   * POST /notifications
   * Create a notification for a user
   */
  static async createNotification(req: Request, res: Response, next: NextFunction) {
    try {
      const parsed = createNotificationSchema.parse(req.body);
      const notification = await NotificationsService.createNotification(parsed.userId, parsed.type, parsed.payload);
      res.status(201).json(notification);
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /notifications?userId=...
   * List notifications for a user
   */
  static async listNotificationsForUser(req: Request, res: Response, next: NextFunction) {
    try {
      const { userId } = userIdQuerySchema.parse(req.query);
      const notifications = await NotificationsService.listNotificationsForUser(userId);
      res.status(200).json(notifications);
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /notifications/:id/read
   * Mark a notification as read
   */
  static async markAsRead(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = notificationIdParamSchema.parse(req.params);
      const notification = await NotificationsService.markAsRead(id);
      res.status(200).json(notification);
    } catch (error) {
      next(error);
    }
  }
}
