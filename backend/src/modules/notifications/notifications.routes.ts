// notifications.routes.ts
// Defines the Express router for notifications endpoints.
// No auth middleware yet. Routing is explicit and readable.

import { Router } from 'express';
import { NotificationsController } from './notifications.controller';

const router = Router();

// POST /notifications - Create a notification for a user
router.post('/', NotificationsController.createNotification);

// GET /notifications - List notifications for a user
router.get('/', NotificationsController.listNotificationsForUser);

// POST /notifications/:id/read - Mark a notification as read
router.post('/:id/read', NotificationsController.markAsRead);

// GET /notifications/:id - Get notification by ID
router.get('/:id', NotificationsController.getNotificationById);

// GET /notifications/unread - List unread notifications for a user
router.get('/unread', NotificationsController.listUnreadNotificationsForUser);

// GET /notifications/count - Count notifications for a user
router.get('/count', NotificationsController.countNotificationsForUser);

// DELETE /notifications/:id - Delete a notification by ID
router.delete('/:id', NotificationsController.deleteNotification);

export default router;
