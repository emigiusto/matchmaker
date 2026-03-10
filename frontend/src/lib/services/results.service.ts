import { apiClient } from "./api-client"
import type { MatchResult, SetScore } from "../types"

export interface SubmitResultDto {
  matchId: string
  winnerId: string
  sets: SetScore[]
}

export const resultsService = {
  async getByMatch(matchId: string): Promise<MatchResult> {
    return apiClient.get<MatchResult>(`/results/by-match/${matchId}`)
  },

  async getByUser(userId: string): Promise<MatchResult[]> {
    return apiClient.get<MatchResult[]>(`/results/by-user/${userId}`)
  },

  async submitSets(resultId: string, sets: SetScore[]): Promise<MatchResult> {
    return apiClient.post<MatchResult>(`/results/${resultId}/sets`, { sets })
  },

  async confirm(resultId: string): Promise<MatchResult> {
    return apiClient.post<MatchResult>(`/results/${resultId}/confirm`)
  },

  async dispute(resultId: string, reason: string): Promise<MatchResult> {
    return apiClient.post<MatchResult>(`/results/${resultId}/dispute`, { reason })
  },
}
