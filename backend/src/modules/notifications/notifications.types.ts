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
  id: string;
  userId: string;
  type: string;
  payload: Record<string, unknown> | unknown;
  readAt: string | null;
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
