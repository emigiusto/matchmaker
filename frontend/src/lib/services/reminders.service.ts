import { apiClient } from "./api-client"

export interface CreateReminderInput {
  userId: string
  matchId: string
  scheduledAt: string // ISO datetime
}

export const remindersService = {
  async create(input: CreateReminderInput) {
    return apiClient.post<{ id: string }>("/reminders", input)
  },
}
