import { apiClient } from "./api-client"
import type { MatchResult, SetScore, PostMatchQuestionnaire } from "../types"

export interface DisputedResult {
  id: string
  matchId: string
  createdAt: string
  sets: { id: string; setNumber: number; player1Score: number; player2Score: number }[]
  winnerUserId: string | null
  submittedByUserId: string | null
  status: string
  disputedByHostAt: string | null
  disputedByOpponentAt: string | null
  disputeNote: string | null
  match: {
    id: string
    date: string
    time: string
    location: string
    type: string
    participants: { userId: string; userName: string; team: string | null }[]
  }
}

export const resultsService = {
  async getByMatch(matchId: string): Promise<MatchResult> {
    return apiClient.get<MatchResult>(`/results/by-match/${matchId}`)
  },

  async getByUser(userId: string): Promise<MatchResult[]> {
    return apiClient.get<MatchResult[]>(`/results/by-user/${userId}`)
  },

  async submitMatchResult(
    matchId: string,
    sets: SetScore[],
    questionnaire?: PostMatchQuestionnaire,
    teamAssignment?: { teamAUserIds: string[]; teamBUserIds: string[] },
    matchType?: 'competitive' | 'practice',
  ): Promise<MatchResult> {
    return apiClient.post<MatchResult>(`/results/${matchId}/submit-result`, {
      sets,
      questionnaire,
      teamAssignment,
      matchType,
    })
  },

  async submitQuestionnaire(matchId: string, answers: PostMatchQuestionnaire): Promise<PostMatchQuestionnaire> {
    const res = await apiClient.post<{ answers: PostMatchQuestionnaire }>(`/results/${matchId}/questionnaire`, { answers })
    return res.answers
  },

  async getMyQuestionnaire(matchId: string): Promise<PostMatchQuestionnaire | null> {
    const res = await apiClient.get<{ answers: PostMatchQuestionnaire | null }>(`/results/${matchId}/questionnaire/mine`)
    return res.answers
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

  async getDisputedResults(): Promise<DisputedResult[]> {
    return apiClient.get<DisputedResult[]>(`/results/disputed`)
  },
}
