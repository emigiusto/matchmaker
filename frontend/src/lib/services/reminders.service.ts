import { apiClient } from "./api-client"

export interface CreateReminderInput {
  userId: string
  matchId: string
  scheduledAt: string // ISO datetime
}

export interface Reminder {
  id: string
  userId: string
  matchId: string
  scheduledAt: string
  status: "pending" | "sent" | "failed"
  sentAt?: string | null
  error?: string | null
  createdAt: string
}

export const remindersService = {
  async create(input: CreateReminderInput) {
    return apiClient.post<Reminder>("/reminders", input)
  },

  async listByUser(userId: string): Promise<Reminder[]> {
    const list = await apiClient.get<Reminder[]>("/reminders", { userId })
    return list ?? []
  },

  async delete(reminderId: string, userId: string): Promise<void> {
    await apiClient.delete(`/reminders/${reminderId}?userId=${encodeURIComponent(userId)}`)
  },
}
