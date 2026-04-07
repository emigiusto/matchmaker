import { apiClient } from "./api-client"
import type { SuggestedOpponent } from "../types"

export interface MatchmakingFilters {
  userId: string
  availabilityId?: string
  distanceRadius?: number
  levelRangeMin?: number
  levelRangeMax?: number
  matchType?: "competitive" | "practice"
  topN?: number
  minScore?: number
}

export const matchmakingService = {
  /**
   * Returns suggestions for a specific availability slot.
   * If no availabilityId is given, falls back to the full hybrid feed (same as getAllSuggestions).
   */
  async getSuggestions(userId: string, availabilityId?: string): Promise<SuggestedOpponent[]> {
    const params: Record<string, string> = { userId }
    if (availabilityId) params.availabilityId = availabilityId
    return apiClient.get<SuggestedOpponent[]>("/matchmaking", params)
  },

  /**
   * Returns the full hybrid feed: availability-mode candidates merged with
   * profile-mode candidates, ranked by score. Works even if the user has no
   * open availability slots. Filters are sent to the backend (server-side).
   */
  async getAllSuggestions(filters: MatchmakingFilters): Promise<SuggestedOpponent[]> {
    const params: Record<string, string> = { userId: filters.userId }
    if (filters.distanceRadius != null) params.maxDistanceKm = String(filters.distanceRadius)
    if (filters.levelRangeMin != null) params.minLevel = String(filters.levelRangeMin)
    if (filters.levelRangeMax != null) params.maxLevel = String(filters.levelRangeMax)
    if (filters.topN != null) params.topN = String(filters.topN)
    if (filters.minScore != null) params.minScore = String(filters.minScore)
    return apiClient.get<SuggestedOpponent[]>("/matchmaking/all", params)
  },
}
