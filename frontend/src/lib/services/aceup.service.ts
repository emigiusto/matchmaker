import { apiClient } from "./api-client"

export interface AceUpValidation {
  valid: boolean
  reason?: string
  ladderId?: number
  ladderName?: string
  player?: { playerId: number; ranking: number | null }
  opponent?: { playerId: number; ranking: number | null }
}

export const aceupService = {
  async validate(matchId: string): Promise<AceUpValidation> {
    return apiClient.get<AceUpValidation>(`/aceup/validate/${matchId}`)
  },

  async send(matchId: string): Promise<{ success: boolean; aceupMatchId: number }> {
    return apiClient.post<{ success: boolean; aceupMatchId: number }>(`/aceup/send/${matchId}`)
  },
}
