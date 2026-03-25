import { apiClient } from "./api-client"
import type { Player, PlayerStats } from "../types"

export interface PlayerPreferences {
  id: string
  userId: string
  defaultCity?: string
  preferredClub?: string
  levelValue?: number
  levelConfidence?: number
}

export const playersService = {
  async getAll(): Promise<Player[]> {
    return apiClient.get<Player[]>("/players")
  },

  async getByCity(city: string): Promise<Player[]> {
    return apiClient.get<Player[]>(`/players/by-city/${city}`)
  },

  async getByUser(userId: string): Promise<Player & PlayerPreferences> {
    return apiClient.get<Player & PlayerPreferences>(`/players/by-user/${userId}`)
  },

  async getById(playerId: string): Promise<Player> {
    return apiClient.get<Player>(`/players/${playerId}`)
  },

  async create(
    userId: string,
    data: { preferredClub?: string; defaultCity?: string; levelValue?: number; levelConfidence?: number }
  ): Promise<PlayerPreferences> {
    return apiClient.post<PlayerPreferences>("/players", { userId, ...data })
  },

  async update(
    playerId: string,
    data: { preferredClub?: string; defaultCity?: string; levelValue?: number; levelConfidence?: number }
  ): Promise<PlayerPreferences> {
    return apiClient.patch<PlayerPreferences>(`/players/${playerId}`, data)
  },

  async getStats(playerId: string): Promise<PlayerStats> {
    return apiClient.get<PlayerStats>(`/players/${playerId}/stats`)
  },
}
