import { apiClient } from "./api-client"
import type { MatchResult, SetScore, PostMatchQuestionnaire } from "../types"

export const resultsService = {
  async getByMatch(matchId: string): Promise<MatchResult> {
    return apiClient.get<MatchResult>(`/results/by-match/${matchId}`)
  },

  async getByUser(userId: string): Promise<MatchResult[]> {
    return apiClient.get<MatchResult[]>(`/results/by-user/${userId}`)
  },

  async submitMatchResult(matchId: string, sets: SetScore[], questionnaire?: PostMatchQuestionnaire): Promise<MatchResult> {
    return apiClient.post<MatchResult>(`/results/${matchId}/submit-result`, { sets, questionnaire })
  },

  async submitSets(resultId: string, sets: SetScore[]): Promise<MatchResult> {
    return apiClient.post<MatchResult>(`/results/${resultId}/sets`, { sets })
  },

  async confirm(resultId: string): Promise<MatchResult> {
    return apiClient.post<MatchResult>(`/results/${resultId}/confirm`)
  },

  async dispute(resultId: string, disputeNote: string): Promise<MatchResult> {
    return apiClient.post<MatchResult>(`/results/${resultId}/dispute`, { disputeNote })
  },

  async resolveDispute(resultId: string, sets: SetScore[]): Promise<MatchResult> {
    return apiClient.post<MatchResult>(`/results/${resultId}/resolve-dispute`, { sets })
  },
}
