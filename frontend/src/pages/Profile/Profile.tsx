import { useState } from "react"
import { Link } from "react-router-dom"
import { format } from "date-fns"
import {
  MapPin,
  Activity,
  Target,
  Swords,
  Flame,
  TrendingUp,
  ArrowRight,
  BarChart3,
  Repeat,
  Lightbulb,
  Clock,
  Layers,
  Zap,
} from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Button } from "@/components/ui/button"
import { PageHeader } from "@/components/page-header"
import {
  // TODO: wire to API — replace with playersService.getByUserId(currentUser)
  mockPlayers,
  mockExtendedMatches,
  mockPlayerStats,
  mockRivals,
  mockPerformanceInsights,
  mockPersonalProgress,
  CURRENT_USER_ID,
} from "@/lib/mock-data"

const insightIcons: Record<string, typeof Layers> = {
  surface: Layers,
  level: TrendingUp,
  close: Target,
  time: Clock,
  streak: Flame,
}

export default function ProfilePage() {
  const player = mockPlayers.find((p) => p.userId === CURRENT_USER_ID)!
  const stats = mockPlayerStats
  const progress = mockPersonalProgress
  const allMatches = mockExtendedMatches
  const competitiveMatches = allMatches.filter(
    (m) => m.matchType === "competitive" && m.status === "completed"
  )
  const practiceMatches = allMatches.filter(
    (m) => m.matchType === "practice" && m.status === "completed"
  )
  const [expandedInsight, setExpandedInsight] = useState<string | null>(null)

  return (
    <>
      <PageHeader title="My Profile" description="Your tennis profile, stats, and insights" />
      <div className="flex flex-1 flex-col gap-6 p-5 lg:p-8">
        {/* Profile Header */}
        <Card className="overflow-hidden">
          <div className="border-b border-border/30 bg-primary/5 px-6 py-8">
            <div className="flex items-center gap-6">
              <div className="flex h-24 w-24 items-center justify-center rounded-3xl bg-primary/10 text-3xl font-bold text-primary">
                {player.name.split(" ").map((n) => n[0]).join("")}
              </div>
              <div>
                <h2 className="text-2xl font-bold tracking-tight text-foreground">
                  {player.name}
                </h2>
                <div className="mt-1.5 flex items-center gap-4 text-base text-muted-foreground">
                  <span className="flex items-center gap-1.5">
                    <MapPin className="h-4 w-4" />
                    {player.city}
                  </span>
                </div>
                <div className="mt-3 flex items-center gap-3">
                  <span className="font-mono text-3xl font-bold text-primary">
                    {player.levelValue.toFixed(1)}
                  </span>
                  <span className="text-base text-muted-foreground">Level</span>
                </div>
              </div>
            </div>
          </div>
        </Card>

        {/* ==== PERSONAL PROGRESS DASHBOARD ==== */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg font-bold tracking-tight">
              <BarChart3 className="h-5 w-5 text-primary" />
              Personal Progress
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {/* Matches this month */}
              <div className="rounded-2xl border border-border/40 bg-muted/20 p-4">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Matches this month</p>
                <p className="mt-1 font-mono text-2xl font-bold text-foreground">{progress.matchesThisMonth}</p>
              </div>
              {/* Win rate overall */}
              <div className="rounded-2xl border border-border/40 bg-muted/20 p-4">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Win rate (overall)</p>
                <p className="mt-1 font-mono text-2xl font-bold text-foreground">{progress.winRateOverall}%</p>
              </div>
              {/* Win rate monthly */}
              <div className="rounded-2xl border border-border/40 bg-muted/20 p-4">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Win rate (this month)</p>
                <p className="mt-1 font-mono text-2xl font-bold text-primary">{progress.winRateMonthly}%</p>
              </div>
              {/* Current level */}
              <div className="rounded-2xl border border-border/40 bg-muted/20 p-4">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Current level</p>
                <p className="mt-1 font-mono text-2xl font-bold text-primary">{progress.currentLevel.toFixed(1)}</p>
              </div>
              {/* Most played surface */}
              <div className="rounded-2xl border border-border/40 bg-muted/20 p-4">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Most played surface</p>
                <p className="mt-1 text-xl font-bold text-foreground">{progress.mostPlayedSurface}</p>
              </div>
              {/* Most frequent rival */}
              <div className="rounded-2xl border border-border/40 bg-muted/20 p-4">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Most frequent rival</p>
                <p className="mt-1 text-xl font-bold text-foreground">{progress.mostFrequentRival}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Stats Grid */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardContent className="flex items-center gap-4 p-5">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-primary/10">
                <Swords className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Total</p>
                <p className="font-mono text-2xl font-bold text-foreground">{stats.totalMatches}</p>
                <p className="text-sm text-muted-foreground">{stats.competitiveMatches} comp / {stats.practiceMatches} practice</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="flex items-center gap-4 p-5">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-primary/10">
                <Target className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Win Rate</p>
                <p className="font-mono text-2xl font-bold text-foreground">{stats.winRate}%</p>
                <p className="text-sm text-muted-foreground">{stats.wins}W - {stats.losses}L</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="flex items-center gap-4 p-5">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-primary/10">
                <Flame className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Streak</p>
                <p className="font-mono text-2xl font-bold text-primary">
                  {stats.currentStreak}{stats.streakType === "win" ? "W" : stats.streakType === "loss" ? "L" : ""}
                </p>
                <p className="text-sm text-muted-foreground">Current run</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="flex items-center gap-4 p-5">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-primary/10">
                <Activity className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Avg Opponent</p>
                <p className="font-mono text-2xl font-bold text-foreground">{stats.averageOpponentLevel}</p>
                <p className="text-sm text-muted-foreground">Level</p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* ==== TOP RIVALS ==== */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg font-bold tracking-tight">
              <Repeat className="h-5 w-5 text-primary" />
              Top Rivals
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {mockRivals.map((rival, i) => {
                const headToHead = `${rival.wins}-${rival.losses}`
                const isAhead = rival.wins > rival.losses
                const isTied = rival.wins === rival.losses
                return (
                  <div
                    key={rival.player.id}
                    className="flex items-center justify-between rounded-2xl border border-border/40 bg-muted/20 p-4 transition-colors hover:bg-muted/40"
                  >
                    <div className="flex items-center gap-4">
                      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-sm font-bold text-primary">
                        #{i + 1}
                      </div>
                      <div className="flex h-11 w-11 items-center justify-center rounded-full bg-muted text-sm font-bold text-foreground">
                        {rival.player.name.split(" ").map((n) => n[0]).join("")}
                      </div>
                      <div>
                        <p className="text-base font-semibold text-foreground">{rival.player.name}</p>
                        <p className="text-sm text-muted-foreground">
                          Level {rival.player.levelValue.toFixed(1)} -- {rival.matchesPlayed} matches played
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="text-right">
                        <p className={`font-mono text-lg font-bold ${isAhead ? "text-primary" : isTied ? "text-muted-foreground" : "text-destructive"}`}>
                          {headToHead}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {isAhead ? "You lead" : isTied ? "Tied" : "They lead"}
                        </p>
                      </div>
                      <Button variant="outline" size="sm" className="gap-1.5" asChild>
                        <Link to="/suggested">
                          <Swords className="h-4 w-4" />
                          Rematch
                        </Link>
                      </Button>
                    </div>
                  </div>
                )
              })}
            </div>
          </CardContent>
        </Card>

        {/* ==== PERFORMANCE INSIGHTS ==== */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg font-bold tracking-tight">
              <Lightbulb className="h-5 w-5 text-primary" />
              Performance Insights
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {mockPerformanceInsights.map((insight) => {
                const Icon = insightIcons[insight.icon] || Zap
                const isExpanded = expandedInsight === insight.id
                return (
                  <button
                    key={insight.id}
                    type="button"
                    onClick={() => setExpandedInsight(isExpanded ? null : insight.id)}
                    className="w-full rounded-2xl border border-border/40 bg-muted/20 p-4 text-left transition-all hover:bg-muted/40"
                  >
                    <div className="flex items-center gap-3">
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10">
                        <Icon className="h-4 w-4 text-primary" />
                      </div>
                      <p className="flex-1 text-base font-semibold text-foreground">{insight.text}</p>
                      <ArrowRight className={`h-4 w-4 text-muted-foreground transition-transform ${isExpanded ? "rotate-90" : ""}`} />
                    </div>
                    {isExpanded && (
                      <p className="mt-3 pl-12 text-sm leading-relaxed text-muted-foreground">
                        {insight.detail}
                      </p>
                    )}
                  </button>
                )
              })}
            </div>
            <div className="mt-4 rounded-2xl bg-accent/60 px-4 py-3">
              <p className="text-sm text-accent-foreground">
                Want deeper analysis?{" "}
                <Link to="/ai-coach/insights" className="font-semibold text-primary underline-offset-2 hover:underline">
                  Open AI Player Insights
                </Link>
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Level History Chart */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg font-bold tracking-tight">Level History</CardTitle>
          </CardHeader>
          <CardContent>
            {(() => {
              const BAR_AREA_HEIGHT = 120
              const ratings = stats.ratingHistory.map((p) => p.rating)
              const min = Math.min(...ratings)
              const max = Math.max(...ratings)
              const range = max - min || 0.5
              return (
                <div className="flex items-end gap-2">
                  {stats.ratingHistory.map((point, i) => {
                    const normalized = (point.rating - min) / range
                    const barHeight = Math.max(normalized * BAR_AREA_HEIGHT, 8)
                    return (
                      <div key={i} className="flex flex-1 flex-col items-center gap-1.5">
                        <span className="font-mono text-xs text-muted-foreground">
                          {point.rating.toFixed(1)}
                        </span>
                        <div
                          className="w-full rounded-t-lg bg-primary/20 transition-all hover:bg-primary/40"
                          style={{ height: `${barHeight}px` }}
                        />
                        <span className="text-xs text-muted-foreground">
                          {format(new Date(point.date), "M/d")}
                        </span>
                      </div>
                    )
                  })}
                </div>
              )
            })()}
          </CardContent>
        </Card>

        {/* Match History */}
        <Card>
          <CardHeader className="pb-0">
            <Tabs defaultValue="competitive">
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg font-bold tracking-tight">Match History</CardTitle>
                <TabsList>
                  <TabsTrigger value="competitive" className="text-sm">Competitive</TabsTrigger>
                  <TabsTrigger value="practice" className="text-sm">Practice</TabsTrigger>
                </TabsList>
              </div>

              <TabsContent value="competitive" className="mt-5">
                {competitiveMatches.length === 0 ? (
                  <p className="py-12 text-center text-base text-muted-foreground">No competitive matches yet</p>
                ) : (
                  <div className="space-y-3">
                    {competitiveMatches.map((match) => {
                      const opp = match.player1.userId === CURRENT_USER_ID ? match.player2 : match.player1
                      const isWinner = match.result?.winnerId === "player-001"
                      return (
                        <Link
                          key={match.id}
                          to={`/matches/${match.id}`}
                          className="flex items-center justify-between rounded-2xl border border-border/40 bg-muted/20 p-4 transition-colors hover:bg-muted/40"
                        >
                          <div className="flex items-center gap-3">
                            <div className={`flex h-10 w-10 items-center justify-center rounded-full text-sm font-bold ${isWinner ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"}`}>
                              {isWinner ? "W" : "L"}
                            </div>
                            <div>
                              <p className="text-base font-semibold text-foreground">vs {opp.name}</p>
                              <p className="text-sm text-muted-foreground">{format(new Date(match.date), "MMM d, yyyy")}</p>
                            </div>
                          </div>
                          {match.result && (
                            <p className="font-mono text-base font-medium text-foreground">
                              {match.result.sets.map((s) => `${s.player1Score}-${s.player2Score}`).join(" ")}
                            </p>
                          )}
                        </Link>
                      )
                    })}
                  </div>
                )}
              </TabsContent>

              <TabsContent value="practice" className="mt-5">
                {practiceMatches.length === 0 ? (
                  <p className="py-12 text-center text-base text-muted-foreground">No practice matches yet</p>
                ) : (
                  <div className="space-y-3">
                    {practiceMatches.map((match) => {
                      const opp = match.player1.userId === CURRENT_USER_ID ? match.player2 : match.player1
                      const isWinner = match.result?.winnerId === "player-001"
                      return (
                        <Link
                          key={match.id}
                          to={`/matches/${match.id}`}
                          className="flex items-center justify-between rounded-2xl border border-border/40 bg-muted/20 p-4 transition-colors hover:bg-muted/40"
                        >
                          <div className="flex items-center gap-3">
                            <div className={`flex h-10 w-10 items-center justify-center rounded-full text-sm font-bold ${isWinner ? "bg-practice/10 text-practice" : "bg-muted text-muted-foreground"}`}>
                              {isWinner ? "W" : "L"}
                            </div>
                            <div>
                              <p className="text-base font-semibold text-foreground">vs {opp.name}</p>
                              <p className="text-sm text-muted-foreground">{format(new Date(match.date), "MMM d, yyyy")}</p>
                            </div>
                          </div>
                          {match.result && (
                            <p className="font-mono text-base font-medium text-foreground">
                              {match.result.sets.map((s) => `${s.player1Score}-${s.player2Score}`).join(" ")}
                            </p>
                          )}
                        </Link>
                      )
                    })}
                  </div>
                )}
              </TabsContent>
            </Tabs>
          </CardHeader>
        </Card>
      </div>
    </>
  )
}
