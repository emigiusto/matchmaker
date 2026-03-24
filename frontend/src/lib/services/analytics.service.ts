import { apiClient } from './api-client'
import type { AdminStatsDTO } from '../analytics/analytics.types'

export type { AdminStatsDTO }

export const analyticsService = {
  getAdminStats(days = 30, eventType?: string): Promise<AdminStatsDTO> {
    const params = new URLSearchParams({ days: String(days) })
    if (eventType) params.set('eventType', eventType)
    return apiClient.get<AdminStatsDTO>(`/analytics/admin/stats?${params}`)
  },

  clearStatsCache(): Promise<{ ok: boolean }> {
    return apiClient.post('/analytics/admin/cache/clear', {})
  },

  clearAvailabilityCache(): Promise<{ ok: boolean }> {
    return apiClient.post('/analytics/admin/cache/clear-availability', {})
  },
}
