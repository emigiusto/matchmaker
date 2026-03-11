import { apiClient } from "./api-client"

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:3000"

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
    const url = new URL(`${API_BASE_URL}/reminders/${reminderId}`)
    url.searchParams.set("userId", userId)
    const res = await fetch(url.toString(), { method: "DELETE" })
    if (!res.ok) {
      const text = await res.text().catch(() => "Unknown error")
      throw new Error(text)
    }
  },
}
