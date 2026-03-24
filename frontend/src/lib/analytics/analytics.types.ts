export interface AdminStatsDTO {
  dau: number
  wau: number
  mau: number
  topEvents: Array<{ eventType: string; count: number }>
  funnelSteps: Array<{ step: string; count: number }>
  activeUsersDaily: Array<{ date: string; count: number }>
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
