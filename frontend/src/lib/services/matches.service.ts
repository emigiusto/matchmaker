import { apiClient } from "./api-client"
import type { Match } from "../types"

export const matchesService = {
  async getUpcoming(userId: string): Promise<Match[]> {
    return apiClient.get<Match[]>("/matches/upcoming", { userId })
  },

  async getPast(userId: string): Promise<Match[]> {
    return apiClient.get<Match[]>("/matches/past", { userId })
  },

  async getByPlayer(playerId: string): Promise<Match[]> {
    return apiClient.get<Match[]>(`/matches/by-player/${playerId}`)
  },

  async getById(matchId: string): Promise<Match> {
    return apiClient.get<Match>(`/matches/${matchId}`)
  },
}
