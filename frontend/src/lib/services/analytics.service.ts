import { apiClient } from './api-client'
import type { AdminStatsDTO } from '../analytics/analytics.types'

export type { AdminStatsDTO }

export const analyticsService = {
  getAdminStats(): Promise<AdminStatsDTO> {
    return apiClient.get<AdminStatsDTO>('/analytics/admin/stats')
  },
}
