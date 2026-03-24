import { useEffect, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '@/lib/auth/AuthContext'
import { analyticsService } from '@/lib/services/analytics.service'
import type { AdminStatsDTO } from '@/lib/analytics/analytics.types'
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from 'recharts'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

export default function AdminDashboard() {
  const { user, isAdmin, loading } = useAuth()
  const [stats, setStats] = useState<AdminStatsDTO | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [fetching, setFetching] = useState(true)

  useEffect(() => {
    if (!loading && isAdmin) {
      analyticsService.getAdminStats()
        .then(setStats)
        .catch((e: Error) => setError(e.message))
        .finally(() => setFetching(false))
    } else if (!loading) {
      setFetching(false)
    }
  }, [loading, isAdmin])

  if (loading || fetching) {
    return (
      <div className="min-h-screen flex items-center justify-center text-muted-foreground">
        Loading…
      </div>
    )
  }

  if (!user || !isAdmin) return <Navigate to="/" replace />

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center text-destructive">
        Failed to load stats: {error}
      </div>
    )
  }

  if (!stats) return null

  return (
    <div className="min-h-screen bg-background p-6 space-y-6">
      <h1 className="text-2xl font-bold">Admin Dashboard</h1>

      {/* DAU / WAU / MAU */}
      <div className="grid grid-cols-3 gap-4">
        <StatCard title="DAU" value={stats.dau} />
        <StatCard title="WAU" value={stats.wau} />
        <StatCard title="MAU" value={stats.mau} />
      </div>

      {/* Daily active users chart */}
      <Card>
        <CardHeader><CardTitle>Daily Active Users (14 days)</CardTitle></CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={stats.activeUsersDaily}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="date" tick={{ fontSize: 11 }} />
              <YAxis allowDecimals={false} />
              <Tooltip />
              <Line type="monotone" dataKey="count" stroke="#6366f1" dot={false} strokeWidth={2} />
            </LineChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Funnel */}
      <Card>
        <CardHeader><CardTitle>Funnel</CardTitle></CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={160}>
            <BarChart data={stats.funnelSteps} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis type="number" allowDecimals={false} />
              <YAxis type="category" dataKey="step" tick={{ fontSize: 12 }} width={120} />
              <Tooltip />
              <Bar dataKey="count" fill="#6366f1" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Top events + Recent activity side by side */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader><CardTitle>Top Events (30 days)</CardTitle></CardHeader>
          <CardContent>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-muted-foreground border-b">
                  <th className="pb-2">Event</th>
                  <th className="pb-2 text-right">Count</th>
                </tr>
              </thead>
              <tbody>
                {stats.topEvents.map((e) => (
                  <tr key={e.eventType} className="border-b last:border-0">
                    <td className="py-1 font-mono text-xs">{e.eventType}</td>
                    <td className="py-1 text-right tabular-nums">{e.count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Recent Activity</CardTitle></CardHeader>
          <CardContent className="max-h-96 overflow-y-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-muted-foreground border-b">
                  <th className="pb-2 pr-2">Time</th>
                  <th className="pb-2 pr-2">Event</th>
                  <th className="pb-2">User</th>
                </tr>
              </thead>
              <tbody>
                {stats.recentEvents.map((e) => (
                  <tr key={e.id} className="border-b last:border-0">
                    <td className="py-1 pr-2 font-mono text-muted-foreground whitespace-nowrap">
                      {new Date(e.createdAt).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </td>
                    <td className="py-1 pr-2 font-semibold whitespace-nowrap">{e.eventType}</td>
                    <td className="py-1 text-muted-foreground">
                      {e.userEmail
                        ? <span title={e.userId ?? undefined}>{e.userName ? `${e.userName} · ` : ''}{e.userEmail}</span>
                        : <span className="italic">{e.userId ? e.userId.slice(0, 8) : 'anon'}</span>
                      }
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

function StatCard({ title, value }: { title: string; value: number }) {
  return (
    <Card>
      <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">{title}</CardTitle></CardHeader>
      <CardContent>
        <p className="text-3xl font-bold tabular-nums">{value}</p>
      </CardContent>
    </Card>
  )
}
