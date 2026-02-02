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

export default router;
