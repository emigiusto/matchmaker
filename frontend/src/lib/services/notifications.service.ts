import { apiClient } from "./api-client"
import { adaptNotification } from "../api/adapters"
import type { BackendNotificationDTO } from "../api/adapters"
import type { Notification } from "../types"

export const notificationsService = {
  async getAll(userId: string): Promise<Notification[]> {
    const dtos = await apiClient.get<BackendNotificationDTO[]>("/notifications", { userId })
    return (dtos ?? []).map(adaptNotification)
  },

  async getUnread(userId: string): Promise<Notification[]> {
    const dtos = await apiClient.get<BackendNotificationDTO[]>("/notifications/unread", { userId })
    return (dtos ?? []).map(adaptNotification)
  },

  async markAsRead(notificationId: string): Promise<Notification> {
    const dto = await apiClient.post<BackendNotificationDTO>(`/notifications/${notificationId}/read`)
    return adaptNotification(dto)
  },

  async markAllAsRead(notifications: Notification[]): Promise<void> {
    const unread = notifications.filter((n) => !n.read)
    await Promise.all(unread.map((n) => this.markAsRead(n.id)))
  },
}
