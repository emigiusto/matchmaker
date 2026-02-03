// notifications.routes.ts
// Defines the Express router for notifications endpoints.
// No auth middleware yet. Routing is explicit and readable.

import { Router } from 'express';
import { NotificationsController } from './notifications.controller';

const router = Router();



/**
 * @openapi
 * /notifications:
 *   post:
 *     summary: Create a notification for a user
 *     description: Creates a notification for a user.
 *     tags:
 *       - Notifications
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/NotificationInput'
 *     responses:
 *       201:
 *         description: Notification created
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Notification'
 */
router.post('/', NotificationsController.createNotification);



/**
 * @openapi
 * /notifications:
 *   get:
 *     summary: List notifications for a user
 *     description: Retrieves notifications for a user.
 *     tags:
 *       - Notifications
 *     responses:
 *       200:
 *         description: List of notifications
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/Notification'
 */
router.get('/', NotificationsController.listNotificationsForUser);



/**
 * @openapi
 * /notifications/{id}/read:
 *   post:
 *     summary: Mark a notification as read
 *     description: Marks a notification as read by its ID.
 *     tags:
 *       - Notifications
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Notification ID
 *     responses:
 *       200:
 *         description: Notification marked as read
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Notification'
 */
router.post('/:id/read', NotificationsController.markAsRead);



/**
 * @openapi
 * /notifications/{id}:
 *   get:
 *     summary: Get notification by ID
 *     description: Retrieves a notification by its ID.
 *     tags:
 *       - Notifications
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Notification ID
 *     responses:
 *       200:
 *         description: Notification details
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Notification'
 */
router.get('/:id', NotificationsController.getNotificationById);



/**
 * @openapi
 * /notifications/unread:
 *   get:
 *     summary: List unread notifications for a user
 *     description: Retrieves unread notifications for a user.
 *     tags:
 *       - Notifications
 *     responses:
 *       200:
 *         description: List of unread notifications
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/Notification'
 */
router.get('/unread', NotificationsController.listUnreadNotificationsForUser);



/**
 * @openapi
 * /notifications/count:
 *   get:
 *     summary: Count notifications for a user
 *     description: Returns the count of notifications for a user.
 *     tags:
 *       - Notifications
 *     responses:
 *       200:
 *         description: Notification count
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 count:
 *                   type: integer
 *                   description: Number of notifications
 */
router.get('/count', NotificationsController.countNotificationsForUser);



/**
 * @openapi
 * /notifications/{id}:
 *   delete:
 *     summary: Delete a notification by ID
 *     description: Deletes a notification by its ID.
 *     tags:
 *       - Notifications
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Notification ID
 *     responses:
 *       204:
 *         description: Notification deleted
 */
router.delete('/:id', NotificationsController.deleteNotification);

export default router;
