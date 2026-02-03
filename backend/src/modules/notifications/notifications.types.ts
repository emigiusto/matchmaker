// notifications.types.ts
// API-facing types for the notifications module
//
// Notification is storage-only: it records the notification event for a user.
// Delivery (push, email, etc.) is handled elsewhere (future).

/**
 * NotificationDTO represents a notification stored for a user.
 * - payload is unconstrained (may be any object)
 * - readAt is nullable (unread if null)
 * - createdAt is an ISO string
 * - No delivery metadata
 */
export interface NotificationDTO {
  /** Unique notification ID */
  id: string;
  /** User who received the notification */
  userId: string;
  /** Notification type */
  type: string;
  /** Notification payload (unconstrained) */
  payload: Record<string, unknown> | unknown;
  /** ISO datetime string if read, null if unread */
  readAt: string | null;
  /** ISO datetime string */
  createdAt: string;
}

/**
 * Input for creating a new notification
 */
export interface CreateNotificationInput {
  userId: string;
  type: string;
  payload: Record<string, unknown> | unknown;
}
