import { apiClient } from "./api-client"
import type { Player } from "../types"

export const playersService = {
  async getAll(): Promise<Player[]> {
    return apiClient.get<Player[]>("/players")
  },

  async getByCity(city: string): Promise<Player[]> {
    return apiClient.get<Player[]>(`/players/by-city/${city}`)
  },

  async getByUser(userId: string): Promise<Player> {
    return apiClient.get<Player>(`/players/by-user/${userId}`)
  },

  async getById(playerId: string): Promise<Player> {
    return apiClient.get<Player>(`/players/${playerId}`)
  },
}
