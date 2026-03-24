export interface AdminStatsDTO {
  dau: number
  wau: number
  mau: number
  totalUsers: number
  newSignups: { today: number; thisWeek: number; thisMonth: number }
  topEvents: Array<{ eventType: string; count: number }>
  funnelSteps: Array<{ step: string; count: number }>
  activeUsersDaily: Array<{ date: string; count: number }>
  newUsersDaily: Array<{ date: string; count: number }>
  topUsers: Array<{ userId: string; email: string | null; name: string | null; eventCount: number; lastSeenAt: string }>
  topPages: Array<{ path: string; views: number; uniques: number }>
  pageViewsDaily: Array<{ date: string; views: number }>
  recentEvents: Array<{
    id: string
    userId: string | null
    userEmail: string | null
    userName: string | null
    eventType: string
    metadata: unknown
    source: string
    createdAt: string
  }>
}
