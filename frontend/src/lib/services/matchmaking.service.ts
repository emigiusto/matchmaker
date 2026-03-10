import { apiClient } from "./api-client"
import type { SuggestedOpponent } from "../types"

export interface MatchmakingFilters {
  userId: string
  availabilityId?: string
  distanceRadius?: number
  levelRangeMin?: number
  levelRangeMax?: number
  matchType?: "competitive" | "practice"
}

export const matchmakingService = {
  async getSuggestions(userId: string, availabilityId?: string): Promise<SuggestedOpponent[]> {
    const params: Record<string, string> = { userId }
    if (availabilityId) params.availabilityId = availabilityId
    return apiClient.get<SuggestedOpponent[]>("/matchmaking", params)
  },

  async getAllSuggestions(filters: MatchmakingFilters): Promise<SuggestedOpponent[]> {
    const params: Record<string, string> = { userId: filters.userId }
    if (filters.distanceRadius) params.distanceRadius = String(filters.distanceRadius)
    if (filters.levelRangeMin) params.levelRangeMin = String(filters.levelRangeMin)
    if (filters.levelRangeMax) params.levelRangeMax = String(filters.levelRangeMax)
    if (filters.matchType) params.matchType = filters.matchType
    return apiClient.get<SuggestedOpponent[]>("/matchmaking/all", params)
  },
}
