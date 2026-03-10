import { apiClient } from "./api-client"
import type { Availability } from "../types"

export interface CreateAvailabilityDto {
  userId: string
  playerId: string
  date: string
  time: string
  location: string
  matchType: "competitive" | "practice"
  levelRangeMin: number
  levelRangeMax: number
  surfacePreference: "hard" | "clay" | "grass" | "any"
}

export const availabilityService = {
  async getAll(userId: string): Promise<Availability[]> {
    return apiClient.get<Availability[]>("/availability", { userId })
  },

  async create(data: CreateAvailabilityDto): Promise<Availability> {
    return apiClient.post<Availability>("/availability", data)
  },

  async delete(id: string): Promise<void> {
    return apiClient.delete<void>(`/availability/${id}`)
  },
}
