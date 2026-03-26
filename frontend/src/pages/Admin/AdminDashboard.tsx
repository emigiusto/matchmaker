import React, { useEffect, useState, useMemo } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { useAuth } from '@/lib/auth/AuthContext'
import { analyticsService } from '@/lib/services/analytics.service'
import { startImpersonation } from '@/lib/auth/impersonation'
import type { AdminStatsDTO } from '@/lib/analytics/analytics.types'
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend,
} from 'recharts'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Users, TrendingUp, Activity, UserPlus, RefreshCw, AlertTriangle } from 'lucide-react'
import { resultsService } from '@/lib/services/results.service'
import type { DisputedResult } from '@/lib/services/results.service'

type Period = 7 | 14 | 30 | 90

const PERIODS: { label: string; value: Period }[] = [
  { label: '7d', value: 7 },
  { label: '14d', value: 14 },
  { label: '30d', value: 30 },
  { label: '90d', value: 90 },
]

export default function AdminDashboard() {
  const { user, isAdmin, loading } = useAuth()
  const [stats, setStats] = useState<AdminStatsDTO | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [fetching, setFetching] = useState(true)
  const [period, setPeriod] = useState<Period>(30)
  const [clearing, setClearing] = useState<'stats' | 'availability' | null>(null)

  function load(p: Period) {
    setFetching(true)
    setError(null)
    analyticsService.getAdminStats(p)
      .then(setStats)
      .catch((e: Error) => setError(e.message))
      .finally(() => setFetching(false))
  }

  useEffect(() => {
    if (!loading && isAdmin) load(period)
    else if (!loading) setFetching(false)
  }, [loading, isAdmin]) // eslint-disable-line react-hooks/exhaustive-deps

  if (loading) {
    return <LoadingScreen />
  }

  if (!user || !isAdmin) return <Navigate to="/" replace />

  function handlePeriod(p: Period) {
    setPeriod(p)
    load(p)
  }

  async function handleClearStats() {
    setClearing('stats')
    try {
      await analyticsService.clearStatsCache()
      load(period)
    } finally {
      setClearing(null)
    }
  }

  async function handleClearAvailability() {
    setClearing('availability')
    try {
      await analyticsService.clearAvailabilityCache()
    } finally {
      setClearing(null)
    }
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b bg-card px-6 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <a href="/" className="text-muted-foreground hover:text-foreground transition-colors text-sm">← Home</a>
            <h1 className="text-xl font-bold">Admin Dashboard</h1>
          </div>
          <div className="flex items-center gap-3">
            {/* Period selector */}
            <div className="flex items-center rounded-lg border overflow-hidden">
              {PERIODS.map(({ label, value }) => (
                <button
                  key={value}
                  onClick={() => handlePeriod(value)}
                  className={`px-3 py-1.5 text-sm font-medium transition-colors ${
                    period === value
                      ? 'bg-primary text-primary-foreground'
                      : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-1">
              <CacheButton
                label="Stats cache"
                loading={clearing === 'stats'}
                onClick={handleClearStats}
                title="Clear analytics stats cache and reload"
              />
              <CacheButton
                label="Availability cache"
                loading={clearing === 'availability'}
                onClick={handleClearAvailability}
                title="Clear court availability cache"
              />
            </div>
            <button
              onClick={() => load(period)}
              className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
              title="Refresh"
            >
              <RefreshCw className={`h-4 w-4 ${fetching ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-7xl mx-auto p-4 md:p-6">
        {error && (
          <div className="mb-4 rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            Failed to load stats: {error}
          </div>
        )}

        {fetching && !stats ? (
          <LoadingScreen />
        ) : stats ? (
          <DashboardContent stats={stats} period={period} />
        ) : null}
      </div>
    </div>
  )
}

function DashboardContent({ stats, period }: { stats: AdminStatsDTO; period: Period }) {
  const { refreshUser } = useAuth()
  const navigate = useNavigate()
  const [disputes, setDisputes] = useState<DisputedResult[]>([])
  const [disputesLoading, setDisputesLoading] = useState(true)

  useEffect(() => {
    resultsService.getDisputedResults()
      .then(setDisputes)
      .catch(() => setDisputes([]))
      .finally(() => setDisputesLoading(false))
  }, [])

  // Merge active + new users into one chart dataset
  const combinedDaily = useMemo(() => {
    const map = new Map<string, { date: string; active: number; new: number }>()
    for (const r of stats.activeUsersDaily) {
      map.set(r.date, { date: fmtDate(r.date), active: r.count, new: 0 })
    }
    for (const r of stats.newUsersDaily) {
      const existing = map.get(r.date)
      if (existing) existing.new = r.count
      else map.set(r.date, { date: fmtDate(r.date), active: 0, new: r.count })
    }
    return Array.from(map.values()).sort((a, b) => a.date.localeCompare(b.date))
  }, [stats])

  return (
    <Tabs defaultValue="overview" className="space-y-6">
      <TabsList>
        <TabsTrigger value="overview">Overview</TabsTrigger>
        <TabsTrigger value="pages">Pages</TabsTrigger>
        <TabsTrigger value="users">Users</TabsTrigger>
        <TabsTrigger value="active">Active</TabsTrigger>
        <TabsTrigger value="events">Events</TabsTrigger>
        <TabsTrigger value="disputes" className="flex items-center gap-1.5">
          <AlertTriangle className="h-3.5 w-3.5" />
          Disputes
          {disputes.length > 0 && (
            <Badge variant="destructive" className="h-4 min-w-4 px-1 text-[10px] rounded-full">
              {disputes.length}
            </Badge>
          )}
        </TabsTrigger>
      </TabsList>

      {/* ── OVERVIEW ── */}
      <TabsContent value="overview" className="space-y-6">
        {/* Stat cards row 1 — users */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatCard icon={<Users />} title="Total Users" value={stats.totalUsers} />
          <StatCard icon={<UserPlus />} title="New Today" value={stats.newSignups.today} />
          <StatCard icon={<UserPlus />} title="New This Week" value={stats.newSignups.thisWeek} />
          <StatCard icon={<UserPlus />} title="New This Month" value={stats.newSignups.thisMonth} />
        </div>

        {/* Stat cards row 2 — activity */}
        <div className="grid grid-cols-3 gap-3">
          <StatCard icon={<Activity />} title="DAU" value={stats.dau} sub="today" />
          <StatCard icon={<Activity />} title="WAU" value={stats.wau} sub="7 days" />
          <StatCard icon={<TrendingUp />} title="MAU" value={stats.mau} sub="30 days" />
        </div>

        {/* Activity chart */}
        <Card>
          <CardHeader>
            <CardTitle>Activity — last {period} days</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={combinedDaily}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11 }} width={28} />
                <Tooltip contentStyle={{ fontSize: 12 }} />
                <Legend iconType="circle" iconSize={8} />
                <Line type="monotone" dataKey="active" name="Active users" stroke="#6366f1" dot={false} strokeWidth={2} />
                <Line type="monotone" dataKey="new" name="New signups" stroke="#22c55e" dot={false} strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Funnel */}
        <Card>
          <CardHeader>
            <div>
              <CardTitle>Conversion Funnel</CardTitle>
              <p className="text-xs text-muted-foreground mt-0.5">All-time unique users per stage</p>
            </div>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={160}>
              <BarChart data={stats.funnelSteps} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11 }} />
                <YAxis type="category" dataKey="step" tick={{ fontSize: 12 }} width={130} />
                <Tooltip contentStyle={{ fontSize: 12 }} />
                <Bar dataKey="count" fill="#6366f1" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Top events */}
        <Card>
          <CardHeader>
            <CardTitle>Top Events ({period} days)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {stats.topEvents.map((e, i) => {
                const max = stats.topEvents[0]?.count ?? 1
                const pct = Math.round((e.count / max) * 100)
                return (
                  <div key={e.eventType} className="flex items-center gap-3">
                    <span className="text-xs text-muted-foreground w-4 text-right">{i + 1}</span>
                    <div className="flex-1">
                      <div className="flex items-center justify-between mb-0.5">
                        <EventBadge type={e.eventType} />
                        <span className="text-sm font-semibold tabular-nums">{e.count.toLocaleString()}</span>
                      </div>
                      <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                        <div className="h-full bg-primary/60 rounded-full" style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </CardContent>
        </Card>
      </TabsContent>

      {/* ── PAGES ── */}
      <TabsContent value="pages">
        <PagesTab topPages={stats.topPages} pageViewsDaily={stats.pageViewsDaily} period={period} />
      </TabsContent>

      {/* ── USERS ── */}
      <TabsContent value="users">
        <UsersTab topUsers={stats.topUsers} period={period} onImpersonate={async (userId, displayName) => {
          const res = await analyticsService.impersonate(userId)
          startImpersonation(res.token, displayName)
          await refreshUser()
          navigate('/')
        }} />
      </TabsContent>

      {/* ── ACTIVE (logged-in users only) ── */}
      <TabsContent value="active">
        <ActiveUsersTab loggedInStats={stats.loggedInStats ?? { dau: 0, wau: 0, mau: 0, activeUsersDaily: [], topUsers: [] }} period={period} onImpersonate={async (userId, displayName) => {
          const res = await analyticsService.impersonate(userId)
          startImpersonation(res.token, displayName)
          await refreshUser()
          navigate('/')
        }} />
      </TabsContent>

      {/* ── EVENTS ── */}
      <TabsContent value="events">
        <EventsTab recentEvents={stats.recentEvents} eventTypes={stats.topEvents.map((e) => e.eventType)} />
      </TabsContent>

      {/* ── DISPUTES ── */}
      <TabsContent value="disputes">
        <DisputesTab disputes={disputes} loading={disputesLoading} onResolve={(resultId, sets) =>
          resultsService.resolveDispute(resultId, sets).then(() =>
            resultsService.getDisputedResults().then(setDisputes)
          )
        } />
      </TabsContent>
    </Tabs>
  )
}

// ── Pages tab ──────────────────────────────────────────────────────────────

function PagesTab({
  topPages,
  pageViewsDaily,
  period,
}: {
  topPages: AdminStatsDTO['topPages']
  pageViewsDaily: AdminStatsDTO['pageViewsDaily']
  period: Period
}) {
  const chartData = pageViewsDaily.map((r) => ({ date: fmtDate(r.date), views: r.views }))
  const maxViews = topPages[0]?.views ?? 1

  return (
    <div className="space-y-4">
      {/* Page views over time */}
      <Card>
        <CardHeader>
          <CardTitle>Page Views — last {period} days</CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="date" tick={{ fontSize: 11 }} />
              <YAxis allowDecimals={false} tick={{ fontSize: 11 }} width={36} />
              <Tooltip contentStyle={{ fontSize: 12 }} />
              <Line type="monotone" dataKey="views" name="Page views" stroke="#f59e0b" dot={false} strokeWidth={2} />
            </LineChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Top pages table */}
      <Card>
        <CardHeader>
          <CardTitle>Top Pages ({period} days)</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-muted-foreground">
                <th className="px-4 py-3 font-medium">#</th>
                <th className="px-4 py-3 font-medium">Path</th>
                <th className="px-4 py-3 font-medium text-right">Views</th>
                <th className="px-4 py-3 font-medium text-right">Unique visitors</th>
                <th className="px-4 py-3 font-medium">Share</th>
              </tr>
            </thead>
            <tbody>
              {topPages.map((p, i) => (
                <tr key={p.path} className="border-b last:border-0 hover:bg-muted/40 transition-colors">
                  <td className="px-4 py-3 text-muted-foreground text-xs w-8">{i + 1}</td>
                  <td className="px-4 py-3 font-mono text-xs font-medium">{p.path}</td>
                  <td className="px-4 py-3 text-right tabular-nums font-semibold">{p.views.toLocaleString()}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">{p.uniques.toLocaleString()}</td>
                  <td className="px-4 py-3 w-32">
                    <div className="h-2 bg-muted rounded-full overflow-hidden">
                      <div
                        className="h-full bg-amber-500/70 rounded-full"
                        style={{ width: `${Math.round((p.views / maxViews) * 100)}%` }}
                      />
                    </div>
                  </td>
                </tr>
              ))}
              {topPages.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-muted-foreground text-sm">
                    No page view data yet for this period.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  )
}

// ── Users tab ──────────────────────────────────────────────────────────────

type TopUser = AdminStatsDTO['topUsers'][number]
type SearchedUser = { id: string; name?: string; email?: string; phone?: string; isGuest: boolean }

function ImpersonateButton({ userId, displayName, onImpersonate }: { userId: string; displayName: string; onImpersonate: (userId: string, displayName: string) => Promise<void> }) {
  const [loading, setLoading] = useState(false)
  return (
    <button
      onClick={async () => {
        setLoading(true)
        try { await onImpersonate(userId, displayName) } finally { setLoading(false) }
      }}
      disabled={loading}
      className="rounded-md border px-2.5 py-1 text-xs text-muted-foreground hover:bg-primary hover:text-primary-foreground hover:border-primary transition-colors disabled:opacity-50 disabled:pointer-events-none whitespace-nowrap"
    >
      {loading ? '…' : 'Login as'}
    </button>
  )
}

function UsersTab({ topUsers, period, onImpersonate }: { topUsers: TopUser[]; period: Period; onImpersonate: (userId: string, displayName: string) => Promise<void> }) {
  const [activitySearch, setActivitySearch] = useState('')
  const [userSearch, setUserSearch] = useState('')
  const [searchResults, setSearchResults] = useState<SearchedUser[] | null>(null)
  const [searching, setSearching] = useState(false)

  useEffect(() => {
    const q = userSearch.trim()
    if (q.length < 2) { setSearchResults(null); return }
    const timer = setTimeout(() => {
      setSearching(true)
      analyticsService.searchUsers(q)
        .then(setSearchResults)
        .catch(() => setSearchResults([]))
        .finally(() => setSearching(false))
    }, 300)
    return () => clearTimeout(timer)
  }, [userSearch])

  const filtered = useMemo(() => {
    const q = activitySearch.toLowerCase()
    if (!q) return topUsers
    return topUsers.filter(
      (u) =>
        u.name?.toLowerCase().includes(q) ||
        u.email?.toLowerCase().includes(q) ||
        u.userId.includes(q),
    )
  }, [topUsers, activitySearch])

  const max = topUsers[0]?.eventCount ?? 1

  return (
    <div className="space-y-6">
      {/* ── Find any user ── */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-semibold">Find any user</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Input
            placeholder="Search by name, email or phone…"
            value={userSearch}
            onChange={(e) => setUserSearch(e.target.value)}
            className="max-w-sm"
          />
          {userSearch.length >= 2 && (
            searching ? (
              <p className="text-sm text-muted-foreground">Searching…</p>
            ) : searchResults && searchResults.length === 0 ? (
              <p className="text-sm text-muted-foreground">No users found.</p>
            ) : searchResults && searchResults.length > 0 ? (
              <table className="w-full text-sm">
                <tbody>
                  {searchResults.map((u) => (
                    <tr key={u.id} className="border-b last:border-0 hover:bg-muted/40 transition-colors">
                      <td className="py-2.5 pr-4">
                        {u.name && <p className="font-medium">{u.name}</p>}
                        <div className="flex items-center gap-2 flex-wrap">
                          {u.email && <p className="text-xs text-muted-foreground">{u.email}</p>}
                          {u.phone && <p className="text-xs text-muted-foreground font-mono">{u.phone}</p>}
                          {!u.email && !u.phone && <p className="text-xs text-muted-foreground font-mono">{u.id.slice(0, 12)}…</p>}
                          {u.isGuest && <Badge variant="outline" className="text-xs py-0 h-4">guest</Badge>}
                        </div>
                      </td>
                      <td className="py-2.5 text-right">
                        <ImpersonateButton
                          userId={u.id}
                          displayName={u.name ?? u.email ?? u.id}
                          onImpersonate={onImpersonate}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : null
          )}
        </CardContent>
      </Card>

      {/* ── Top active users ── */}
      <div className="space-y-3">
        <div className="flex items-center gap-3">
          <Input
            placeholder="Filter by name or email…"
            value={activitySearch}
            onChange={(e) => setActivitySearch(e.target.value)}
            className="max-w-sm"
          />
          <span className="text-sm text-muted-foreground">
            {filtered.length} of {topUsers.length} · top active ({period}d)
          </span>
        </div>

        <Card>
          <CardContent className="p-0">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-muted-foreground">
                  <th className="px-4 py-3 font-medium">#</th>
                  <th className="px-4 py-3 font-medium">User</th>
                  <th className="px-4 py-3 font-medium text-right">Events</th>
                  <th className="px-4 py-3 font-medium text-right">Last seen</th>
                  <th className="px-4 py-3 font-medium">Activity</th>
                  <th className="px-4 py-3 font-medium"></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((u, i) => (
                  <tr key={u.userId} className="border-b last:border-0 hover:bg-muted/40 transition-colors">
                    <td className="px-4 py-3 text-muted-foreground text-xs w-8">{i + 1}</td>
                    <td className="px-4 py-3">
                      {u.name && <p className="font-medium">{u.name}</p>}
                      {u.email
                        ? <p className="text-xs text-muted-foreground">{u.email}</p>
                        : <p className="text-xs text-muted-foreground font-mono">{u.userId.slice(0, 12)}…</p>
                      }
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums font-semibold">{u.eventCount}</td>
                    <td className="px-4 py-3 text-right text-xs text-muted-foreground whitespace-nowrap">
                      {fmtRelative(u.lastSeenAt)}
                    </td>
                    <td className="px-4 py-3 w-32">
                      <div className="h-2 bg-muted rounded-full overflow-hidden">
                        <div
                          className="h-full bg-primary/70 rounded-full"
                          style={{ width: `${Math.round((u.eventCount / max) * 100)}%` }}
                        />
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <ImpersonateButton
                        userId={u.userId}
                        displayName={u.name ?? u.email ?? u.userId}
                        onImpersonate={onImpersonate}
                      />
                    </td>
                  </tr>
                ))}
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-muted-foreground text-sm">
                      No users match your filter.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

// ── Active users tab (logged-in users only) ────────────────────────────────

type LoggedInStats = AdminStatsDTO['loggedInStats']

function ActiveUsersTab({ loggedInStats, period, onImpersonate }: {
  loggedInStats: LoggedInStats
  period: Period
  onImpersonate: (userId: string, displayName: string) => Promise<void>
}) {
  const [search, setSearch] = useState('')

  const chartData = useMemo(() =>
    loggedInStats.activeUsersDaily.map((r) => ({ date: fmtDate(r.date), count: r.count })),
    [loggedInStats.activeUsersDaily],
  )

  const filtered = useMemo(() => {
    const q = search.toLowerCase()
    if (!q) return loggedInStats.topUsers
    return loggedInStats.topUsers.filter(
      (u) => u.name?.toLowerCase().includes(q) || u.email?.toLowerCase().includes(q) || u.userId.includes(q),
    )
  }, [loggedInStats.topUsers, search])

  const max = loggedInStats.topUsers[0]?.eventCount ?? 1

  return (
    <div className="space-y-6">
      {/* DAU / WAU / MAU */}
      <div className="grid grid-cols-3 gap-3">
        <StatCard icon={<Activity />} title="DAU" value={loggedInStats.dau} sub="today" />
        <StatCard icon={<Activity />} title="WAU" value={loggedInStats.wau} sub="7 days" />
        <StatCard icon={<TrendingUp />} title="MAU" value={loggedInStats.mau} sub="30 days" />
      </div>

      {/* Daily chart */}
      <Card>
        <CardHeader>
          <CardTitle>Logged-in active users — last {period} days</CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="date" tick={{ fontSize: 11 }} />
              <YAxis allowDecimals={false} tick={{ fontSize: 11 }} width={28} />
              <Tooltip contentStyle={{ fontSize: 12 }} />
              <Line type="monotone" dataKey="count" name="Active users" stroke="#6366f1" dot={false} strokeWidth={2} />
            </LineChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Top active logged-in users */}
      <div className="space-y-3">
        <div className="flex items-center gap-3">
          <Input
            placeholder="Filter by name or email…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="max-w-sm"
          />
          <span className="text-sm text-muted-foreground">
            {filtered.length} of {loggedInStats.topUsers.length} · top active ({period}d)
          </span>
        </div>
        <Card>
          <CardContent className="p-0">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-muted-foreground">
                  <th className="px-4 py-3 font-medium">#</th>
                  <th className="px-4 py-3 font-medium">User</th>
                  <th className="px-4 py-3 font-medium text-right">Events</th>
                  <th className="px-4 py-3 font-medium text-right">Last seen</th>
                  <th className="px-4 py-3 font-medium">Activity</th>
                  <th className="px-4 py-3 font-medium"></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((u, i) => (
                  <tr key={u.userId} className="border-b last:border-0 hover:bg-muted/40 transition-colors">
                    <td className="px-4 py-3 text-muted-foreground text-xs w-8">{i + 1}</td>
                    <td className="px-4 py-3">
                      {u.name && <p className="font-medium">{u.name}</p>}
                      {u.email
                        ? <p className="text-xs text-muted-foreground">{u.email}</p>
                        : <p className="text-xs text-muted-foreground font-mono">{u.userId.slice(0, 12)}…</p>
                      }
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums font-semibold">{u.eventCount}</td>
                    <td className="px-4 py-3 text-right text-xs text-muted-foreground whitespace-nowrap">
                      {fmtRelative(u.lastSeenAt)}
                    </td>
                    <td className="px-4 py-3 w-32">
                      <div className="h-2 bg-muted rounded-full overflow-hidden">
                        <div
                          className="h-full bg-primary/70 rounded-full"
                          style={{ width: `${Math.round((u.eventCount / max) * 100)}%` }}
                        />
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <ImpersonateButton
                        userId={u.userId}
                        displayName={u.name ?? u.email ?? u.userId}
                        onImpersonate={onImpersonate}
                      />
                    </td>
                  </tr>
                ))}
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-muted-foreground text-sm">
                      No users match your filter.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

// ── Events tab ─────────────────────────────────────────────────────────────

type RecentEvent = AdminStatsDTO['recentEvents'][number]

function EventsTab({ recentEvents, eventTypes }: { recentEvents: RecentEvent[]; eventTypes: string[] }) {
  const [typeFilter, setTypeFilter] = useState('')
  const [userSearch, setUserSearch] = useState('')
  const [sourceFilter, setSourceFilter] = useState<'all' | 'client' | 'server'>('all')
  const [expanded, setExpanded] = useState<string | null>(null)

  const filtered = useMemo(() => {
    const q = userSearch.toLowerCase()
    return recentEvents.filter((e) => {
      if (typeFilter && e.eventType !== typeFilter) return false
      if (sourceFilter !== 'all' && e.source !== sourceFilter) return false
      if (q && !e.userEmail?.toLowerCase().includes(q) && !e.userName?.toLowerCase().includes(q) && !(e.userId ?? '').includes(q)) return false
      return true
    })
  }, [recentEvents, typeFilter, userSearch, sourceFilter])

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <Input
          placeholder="Search by user…"
          value={userSearch}
          onChange={(e) => setUserSearch(e.target.value)}
          className="max-w-xs"
        />

        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          className="h-9 rounded-md border border-input bg-background px-3 text-sm"
        >
          <option value="">All event types</option>
          {eventTypes.map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>

        <div className="flex items-center rounded-md border overflow-hidden text-sm">
          {(['all', 'client', 'server'] as const).map((s) => (
            <button
              key={s}
              onClick={() => setSourceFilter(s)}
              className={`px-3 py-1.5 transition-colors ${
                sourceFilter === s
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground'
              }`}
            >
              {s}
            </button>
          ))}
        </div>

        {(typeFilter || userSearch || sourceFilter !== 'all') && (
          <button
            onClick={() => { setTypeFilter(''); setUserSearch(''); setSourceFilter('all') }}
            className="text-xs text-muted-foreground hover:text-foreground underline"
          >
            Clear filters
          </button>
        )}

        <span className="text-sm text-muted-foreground ml-auto">
          {filtered.length} / {recentEvents.length} events
        </span>
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-muted-foreground">
                  <th className="px-4 py-3 font-medium whitespace-nowrap">Time</th>
                  <th className="px-4 py-3 font-medium">Event</th>
                  <th className="px-4 py-3 font-medium">User</th>
                  <th className="px-4 py-3 font-medium">Source</th>
                  <th className="px-4 py-3 font-medium">Metadata</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((e) => {
                  const hasMetadata = Boolean(e.metadata && typeof e.metadata === 'object' && Object.keys(e.metadata as object).length > 0)
                  const isOpen = expanded === e.id
                  return (
                    <React.Fragment key={e.id}>
                      <tr
                        className={`border-b last:border-0 hover:bg-muted/40 transition-colors ${hasMetadata ? 'cursor-pointer' : ''}`}
                        onClick={() => hasMetadata && setExpanded(isOpen ? null : e.id)}
                      >
                        <td className="px-4 py-2.5 font-mono text-xs text-muted-foreground whitespace-nowrap">
                          {fmtRelative(e.createdAt)}
                        </td>
                        <td className="px-4 py-2.5">
                          <EventBadge type={e.eventType} />
                        </td>
                        <td className="px-4 py-2.5">
                          {e.userEmail
                            ? (
                              <div>
                                {e.userName && <p className="font-medium text-xs">{e.userName}</p>}
                                <p className="text-xs text-muted-foreground">{e.userEmail}</p>
                              </div>
                            )
                            : <span className="text-xs text-muted-foreground font-mono italic">{e.userId ? e.userId.slice(0, 8) : 'anon'}</span>
                          }
                        </td>
                        <td className="px-4 py-2.5">
                          <Badge variant={e.source === 'server' ? 'secondary' : 'outline'} className="text-xs">
                            {e.source}
                          </Badge>
                        </td>
                        <td className="px-4 py-2.5 text-xs text-muted-foreground">
                          {hasMetadata
                            ? <span className="underline decoration-dotted">{isOpen ? 'hide ▲' : 'show ▼'}</span>
                            : <span className="text-muted-foreground/40">—</span>
                          }
                        </td>
                      </tr>
                      {isOpen && hasMetadata && (
                        <tr className="border-b bg-muted/20">
                          <td colSpan={5} className="px-6 py-2 pb-3">
                            <pre className="text-xs text-muted-foreground overflow-x-auto">
                              {JSON.stringify(e.metadata as Record<string, unknown>, null, 2)}
                            </pre>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  )
                })}
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-muted-foreground text-sm">
                      No events match your filters.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

// ── Disputes tab ────────────────────────────────────────────────────────────

interface ParsedDisputeNote {
  reason?: string
  proposedSets?: { setNumber: number; playerAScore: number; playerBScore: number }[]
}

function parseDisputeNote(raw: string | null): ParsedDisputeNote {
  if (!raw) return {}
  try { return JSON.parse(raw) } catch { return { reason: raw } }
}

function ResolveDisputeForm({ result, onResolve }: {
  result: DisputedResult
  onResolve: (resultId: string, sets: { setNumber: number; player1Score: number; player2Score: number }[]) => Promise<void>
}) {
  const initialSets = result.sets.length > 0
    ? result.sets.map((s) => ({ setNumber: s.setNumber, player1Score: s.playerAScore, player2Score: s.playerBScore }))
    : [{ setNumber: 1, player1Score: 0, player2Score: 0 }]
  const [sets, setSets] = useState(initialSets)
  const [saving, setSaving] = useState(false)

  function updateSet(idx: number, field: 'player1Score' | 'player2Score', val: number) {
    setSets((prev) => prev.map((s, i) => i === idx ? { ...s, [field]: val } : s))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    try { await onResolve(result.id, sets) } finally { setSaving(false) }
  }

  const teamA = result.match.participants.filter((p) => p.team === 'A').map((p) => p.userName).join(' & ')
    || result.match.participants[0]?.userName || 'Team A'
  const teamB = result.match.participants.filter((p) => p.team === 'B').map((p) => p.userName).join(' & ')
    || result.match.participants[1]?.userName || 'Team B'

  return (
    <form onSubmit={handleSubmit} className="space-y-2 mt-3 pt-3 border-t">
      <p className="text-xs font-medium text-muted-foreground">Set correct scores to resolve:</p>
      {sets.map((s, idx) => (
        <div key={idx} className="flex items-center gap-2 text-sm">
          <span className="text-muted-foreground w-10 shrink-0">Set {s.setNumber}</span>
          <span className="text-xs truncate max-w-[80px]" title={teamA}>{teamA.split(' ')[0]}</span>
          <input
            type="number" min={0} max={99} value={s.player1Score}
            onChange={(e) => updateSet(idx, 'player1Score', Number(e.target.value))}
            className="w-12 rounded border border-input bg-background px-2 py-0.5 text-sm text-center"
          />
          <span className="text-muted-foreground">–</span>
          <input
            type="number" min={0} max={99} value={s.player2Score}
            onChange={(e) => updateSet(idx, 'player2Score', Number(e.target.value))}
            className="w-12 rounded border border-input bg-background px-2 py-0.5 text-sm text-center"
          />
          <span className="text-xs truncate max-w-[80px]" title={teamB}>{teamB.split(' ')[0]}</span>
        </div>
      ))}
      <button
        type="submit"
        disabled={saving}
        className="mt-1 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
      >
        {saving ? 'Saving…' : 'Resolve dispute'}
      </button>
    </form>
  )
}

function DisputesTab({ disputes, loading, onResolve }: {
  disputes: DisputedResult[]
  loading: boolean
  onResolve: (resultId: string, sets: { setNumber: number; player1Score: number; player2Score: number }[]) => Promise<void>
}) {
  const [expanded, setExpanded] = useState<string | null>(null)

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16 text-muted-foreground">
        <RefreshCw className="h-4 w-4 animate-spin mr-2" />
        Loading disputed results…
      </div>
    )
  }

  if (disputes.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-2">
          <AlertTriangle className="h-8 w-8 opacity-30" />
          <p className="text-sm">No disputed results.</p>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-3">
      {disputes.map((d) => {
        const note = parseDisputeNote(d.disputeNote)
        const participants = d.match.participants
        const teamA = participants.filter((p) => p.team === 'A').map((p) => p.userName).join(' & ')
          || participants[0]?.userName || '?'
        const teamB = participants.filter((p) => p.team === 'B').map((p) => p.userName).join(' & ')
          || participants[1]?.userName || '?'
        const isOpen = expanded === d.id

        return (
          <Card key={d.id} className="overflow-hidden">
            <CardContent className="p-4">
              {/* Header row */}
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-0.5">
                  <p className="font-semibold text-sm">{teamA} vs {teamB}</p>
                  <p className="text-xs text-muted-foreground">
                    {d.match.date} · {d.match.time}
                    {d.match.location && ` · ${d.match.location}`}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Badge variant="destructive" className="text-xs">disputed</Badge>
                  <a
                    href={`/matches/${d.matchId}`}
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs text-primary underline hover:no-underline"
                  >
                    View match
                  </a>
                </div>
              </div>

              {/* Scores */}
              {d.sets.length > 0 && (
                <div className="mt-2 flex gap-3 text-xs text-muted-foreground">
                  {d.sets.map((s) => (
                    <span key={s.setNumber} className="font-mono">
                      {s.playerAScore}–{s.playerBScore}
                    </span>
                  ))}
                </div>
              )}

              {/* Dispute note */}
              {(note.reason || note.proposedSets) && (
                <div className="mt-2 rounded-md bg-destructive/5 border border-destructive/20 px-3 py-2 text-xs space-y-1">
                  {note.reason && <p><span className="font-medium">Reason:</span> {note.reason}</p>}
                  {note.proposedSets && note.proposedSets.length > 0 && (
                    <p>
                      <span className="font-medium">Proposed scores:</span>{' '}
                      {note.proposedSets.map((s) => `${s.playerAScore}–${s.playerBScore}`).join(', ')}
                    </p>
                  )}
                </div>
              )}

              {/* Resolve toggle */}
              <button
                onClick={() => setExpanded(isOpen ? null : d.id)}
                className="mt-3 text-xs text-primary underline hover:no-underline"
              >
                {isOpen ? 'Cancel' : 'Resolve…'}
              </button>

              {isOpen && (
                <ResolveDisputeForm result={d} onResolve={async (id, sets) => {
                  await onResolve(id, sets)
                  setExpanded(null)
                }} />
              )}
            </CardContent>
          </Card>
        )
      })}
    </div>
  )
}

// ── Shared components ──────────────────────────────────────────────────────

function StatCard({ icon, title, value, sub }: { icon: React.ReactNode; title: string; value: number; sub?: string }) {
  return (
    <Card>
      <CardHeader className="pb-1 flex flex-row items-center gap-2 space-y-0">
        <span className="text-muted-foreground [&>svg]:h-4 [&>svg]:w-4">{icon}</span>
        <CardTitle className="text-xs text-muted-foreground font-medium">{title}</CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        <p className="text-3xl font-bold tabular-nums">{value.toLocaleString()}</p>
        {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
      </CardContent>
    </Card>
  )
}

const EVENT_COLORS: Record<string, string> = {
  'auth.signup': 'text-green-600 dark:text-green-400',
  'auth.login': 'text-blue-600 dark:text-blue-400',
  'auth.logout': 'text-slate-500',
  'booking.success': 'text-emerald-600 dark:text-emerald-400',
  'booking.failed': 'text-red-600 dark:text-red-400',
  'booking.started': 'text-amber-600 dark:text-amber-400',
  'match.created': 'text-violet-600 dark:text-violet-400',
  'match.completed': 'text-violet-500',
  'match.cancelled': 'text-rose-500',
  'onboarding.completed': 'text-teal-600 dark:text-teal-400',
  'scheduling.request_created': 'text-sky-600 dark:text-sky-400',
  'scheduling.invite_accepted': 'text-indigo-600 dark:text-indigo-400',
  'contact.added': 'text-orange-600 dark:text-orange-400',
  'page.view': 'text-muted-foreground',
}

function EventBadge({ type }: { type: string }) {
  const color = EVENT_COLORS[type] ?? 'text-foreground'
  return <span className={`font-mono text-xs font-semibold whitespace-nowrap ${color}`}>{type}</span>
}

function CacheButton({ label, loading, onClick, title }: { label: string; loading: boolean; onClick: () => void; title: string }) {
  return (
    <button
      onClick={onClick}
      disabled={loading}
      title={title}
      className="flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs text-muted-foreground hover:bg-destructive/10 hover:text-destructive hover:border-destructive/40 transition-colors disabled:opacity-50 disabled:pointer-events-none"
    >
      <RefreshCw className={`h-3 w-3 ${loading ? 'animate-spin' : ''}`} />
      {label}
    </button>
  )
}

function LoadingScreen() {
  return (
    <div className="min-h-[60vh] flex items-center justify-center text-muted-foreground">
      <RefreshCw className="h-5 w-5 animate-spin mr-2" />
      Loading…
    </div>
  )
}

function fmtDate(iso: string): string {
  const [, m, d] = iso.split('-')
  return `${m}/${d}`
}

function fmtRelative(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60_000)
  if (mins < 1) return 'now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  return `${days}d ago`
}
