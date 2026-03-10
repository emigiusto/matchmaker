import { apiClient } from "./api-client"
import type { Notification } from "../types"

export const notificationsService = {
  async getAll(userId: string): Promise<Notification[]> {
    return apiClient.get<Notification[]>("/notifications", { userId })
  },

  async getUnread(userId: string): Promise<Notification[]> {
    return apiClient.get<Notification[]>("/notifications/unread", { userId })
  },

  async markAsRead(notificationId: string): Promise<Notification> {
    return apiClient.post<Notification>(`/notifications/${notificationId}/read`)
  },
}
