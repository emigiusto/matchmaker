import { apiClient } from "./api-client"
import { adaptMatch } from "@/lib/api/adapters"
import type { Match } from "../types"
import type { BackendMatchDTO } from "@/lib/api/adapters"

export const matchesService = {
  async getUpcoming(userId: string): Promise<Match[]> {
    const list = await apiClient.get<BackendMatchDTO[]>("/matches/upcoming", { userId })
    return (list ?? []).map((d) => adaptMatch(d))
  },

  async getPast(userId: string): Promise<Match[]> {
    const list = await apiClient.get<BackendMatchDTO[]>("/matches/past", { userId })
    return (list ?? []).map((d) => adaptMatch(d))
  },

  async getByPlayer(playerId: string): Promise<Match[]> {
    const list = await apiClient.get<BackendMatchDTO[]>(`/matches/by-player/${playerId}`)
    return (list ?? []).map((d) => adaptMatch(d))
  },

  async getById(matchId: string): Promise<Match> {
    const dto = await apiClient.get<BackendMatchDTO>(`/matches/${matchId}`)
    return adaptMatch(dto)
  },

  async cancel(matchId: string, userId: string): Promise<Match> {
    const dto = await apiClient.post<BackendMatchDTO>(`/matches/${matchId}/cancel`, { userId })
    return adaptMatch(dto)
  },

  async reschedule(matchId: string, userId: string, scheduledAt: string, cancelBooking?: boolean): Promise<Match> {
    const dto = await apiClient.post<BackendMatchDTO>(`/matches/${matchId}/reschedule`, { userId, scheduledAt, cancelBooking })
    return adaptMatch(dto)
  },

  async getWhatsappGroupLink(matchId: string): Promise<string> {
    const res = await apiClient.get<{ inviteLink: string }>(`/matches/${matchId}/whatsapp-group-link`)
    return res.inviteLink
  },

}
