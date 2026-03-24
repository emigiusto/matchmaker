import React, { useEffect, useState, useMemo } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '@/lib/auth/AuthContext'
import { analyticsService } from '@/lib/services/analytics.service'
import type { AdminStatsDTO } from '@/lib/analytics/analytics.types'
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend,
} from 'recharts'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Users, TrendingUp, Activity, UserPlus, RefreshCw } from 'lucide-react'

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
          <h1 className="text-xl font-bold">Admin Dashboard</h1>
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
        <TabsTrigger value="events">Events</TabsTrigger>
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
        <UsersTab topUsers={stats.topUsers} period={period} />
      </TabsContent>

      {/* ── EVENTS ── */}
      <TabsContent value="events">
        <EventsTab recentEvents={stats.recentEvents} eventTypes={stats.topEvents.map((e) => e.eventType)} />
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

function UsersTab({ topUsers, period }: { topUsers: TopUser[]; period: Period }) {
  const [search, setSearch] = useState('')

  const filtered = useMemo(() => {
    const q = search.toLowerCase()
    if (!q) return topUsers
    return topUsers.filter(
      (u) =>
        u.name?.toLowerCase().includes(q) ||
        u.email?.toLowerCase().includes(q) ||
        u.userId.includes(q),
    )
  }, [topUsers, search])

  const max = topUsers[0]?.eventCount ?? 1

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Input
          placeholder="Search by name or email…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-sm"
        />
        <span className="text-sm text-muted-foreground">
          {filtered.length} of {topUsers.length} users · {period}d window
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
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-muted-foreground text-sm">
                    No users match your search.
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
                  const hasMetadata = e.metadata && typeof e.metadata === 'object' && Object.keys(e.metadata as object).length > 0
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
                              {JSON.stringify(e.metadata, null, 2)}
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
