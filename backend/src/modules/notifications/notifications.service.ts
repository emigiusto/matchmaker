// notifications.service.ts
// Core logic for notifications. No delivery logic or side effects here.
//
// TODO: Add push notification delivery (future extension point)
// TODO: Add email delivery (future extension point)
// TODO: Add WhatsApp delivery (future extension point)

import { Prisma } from '@prisma/client';
import { prisma } from '../../prisma';
import { NotificationDTO } from './notifications.types';
import { Notification } from '@prisma/client';
import { AppError } from '../../shared/errors/AppError'; // Consistent error handling


/**
 * Create a notification for a user. User must exist.
 * Defensive: No notifications are auto-created implicitly. Only explicit calls create notifications.
 * No delivery logic or side effects. Naming and error handling are consistent with other modules.
 */
export async function createNotification(userId: string, type: string, payload: unknown): Promise<NotificationDTO> {
  // Validate user existence
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new AppError('User not found', 404);

  const notification = await prisma.notification.create({
    data: {
      userId,
      type,
      payload: payload as Prisma.InputJsonValue,
    },
  });
  return toNotificationDTO(notification);
}

/**
 * List all notifications for a user, ordered by createdAt DESC.
 * Defensive: Returns empty array if none exist. No notifications are auto-created.
 * No delivery logic or side effects. Naming and error handling are consistent with other modules.
 */
export async function listNotificationsForUser(userId: string): Promise<NotificationDTO[]> {
  const notifications = await prisma.notification.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
  });
  return notifications.map(toNotificationDTO);
}

/**
 * Mark a notification as read (sets readAt if not already set).
 * Defensive: Idempotent. If already read, returns the notification unchanged.
 * No delivery logic or side effects. Naming and error handling are consistent with other modules.
 */
export async function markAsRead(notificationId: string): Promise<NotificationDTO> {
  const notification = await prisma.notification.findUnique({ where: { id: notificationId } });
  if (!notification) throw new AppError('Notification not found', 404);
  if (notification.readAt) return toNotificationDTO(notification); // Idempotent: Already read

  const updated = await prisma.notification.update({
    where: { id: notificationId },
    data: { readAt: new Date() },
  });
  return toNotificationDTO(updated);
}

// --- Helpers ---
/**
 * Get a notification by ID
 */
export async function getNotificationById(notificationId: string): Promise<NotificationDTO | null> {
  const notification = await prisma.notification.findUnique({ where: { id: notificationId } });
  return notification ? toNotificationDTO(notification) : null;
}

/**
 * List unread notifications for a user
 */
export async function listUnreadNotificationsForUser(userId: string): Promise<NotificationDTO[]> {
  const notifications = await prisma.notification.findMany({
    where: { userId, readAt: null },
    orderBy: { createdAt: 'desc' },
  });
  return notifications.map(toNotificationDTO);
}

/**
 * Count notifications for a user
 */
export async function countNotificationsForUser(userId: string): Promise<number> {
  return prisma.notification.count({ where: { userId } });
}

/**
 * Delete a notification by ID
 */
export async function deleteNotification(notificationId: string): Promise<void> {
  await prisma.notification.delete({ where: { id: notificationId } });
}
function toNotificationDTO(notification: Notification): NotificationDTO {
  return {
    id: notification.id,
    userId: notification.userId,
    type: notification.type,
    payload: notification.payload,
    readAt: notification.readAt ? notification.readAt.toISOString() : null,
    createdAt: notification.createdAt.toISOString(),
  };
}
