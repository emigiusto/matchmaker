import { useState, useEffect } from "react"
import { Link } from "react-router-dom"
import { format } from "date-fns"
import {
  ArrowRight,
  Calendar,
  MapPin,
  Clock,
  TrendingUp,
  CheckCircle,
  XCircle,
  Activity,
  Target,
  Flame,
  Swords,
  Zap,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { PageHeader } from "@/components/page-header"
import { SuggestionCard } from "@/components/suggestion-card"
import { MatchTypeBadge } from "@/components/match-type-badge"
import { StatusBadge } from "@/components/status-badge"
import { IWantToPlayWizard } from "@/components/i-want-to-play-wizard"
import { AddReminderDialog } from "@/components/add-reminder-dialog"
import { AddToCalendarButton } from "@/components/add-to-calendar-button"
import { ResultUploadDialog } from "@/components/result-upload-dialog"
import { useTranslation } from "@/lib/i18n/use-translation"
import { toast } from "sonner"
import { getCurrentUserId } from "@/lib/current-user"
import { matchesService } from "@/lib/services/matches.service"
import { invitesService } from "@/lib/services/invites.service"
import { adaptInvite, adaptMatch } from "@/lib/api/adapters"
import type { Match, Invite } from "@/lib/types"
import {
  mockSuggestions,
  mockInvites,
  mockMatches,
} from "@/lib/mock-data"

export default function Dashboard() {
  const currentUserId = getCurrentUserId()
  const [matches, setMatches] = useState<Match[]>(mockMatches)
  const [invites, setInvites] = useState<Invite[]>(mockInvites)
  const [suggestions] = useState(mockSuggestions)
  const [wizardOpen, setWizardOpen] = useState(false)
  const [loading, setLoading] = useState(true)
  const { t } = useTranslation()
  const today = format(new Date(), "yyyy-MM-dd")

  useEffect(() => {
    let cancelled = false
    async function fetchData() {
      setLoading(true)
      try {
        const [matchesRes, invitesRes] = await Promise.all([
          matchesService.getUpcoming(currentUserId).then((list: unknown[]) => list.map((d: unknown) => adaptMatch(d as import("@/lib/api/adapters").BackendMatchDTO))).catch(() => mockMatches),
          invitesService.getByUser(currentUserId).then((list: unknown[]) => list.map((d: unknown) => adaptInvite(d as import("@/lib/api/adapters").BackendInviteDTO))).catch(() => mockInvites),
        ])
        if (!cancelled) {
          setMatches(matchesRes)
          setInvites(invitesRes)
        }
      } catch {
        if (!cancelled) {
          setMatches(mockMatches)
          setInvites(mockInvites)
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    fetchData()
    return () => { cancelled = true }
  }, [currentUserId])

  const matchesToday = matches.filter(
    (m) => m.date === today && m.status === "scheduled" && !m.result
  )
  const upcomingMatches = matches.filter(
    (m) => m.status === "scheduled" || m.status === "awaiting_confirmation"
  )
  const pastMatches = matches.filter((m) => m.status === "completed")
  const pendingInvites = invites.filter(
    (i) => i.status === "pending" && (i.toUserId === currentUserId || i.isOpen || i.fromUserId === currentUserId)
  )

  async function handleAcceptInvite(token: string) {
    try {
      await invitesService.accept(token, currentUserId)
      setInvites((prev) =>
        prev.map((i) => (i.token === token ? { ...i, status: "accepted" as const } : i))
      )
      toast.success(t("success.invited"))
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to accept invite")
    }
  }

  async function handleDeclineInvite(token: string) {
    try {
      await invitesService.decline(token)
      setInvites((prev) =>
        prev.map((i) => (i.token === token ? { ...i, status: "declined" as const } : i))
      )
      toast.success(t("success.deleted"))
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to decline invite")
    }
  }

  if (loading) {
    return (
      <PageHeader title={t("dashboard.matchesToday")} description={t("dashboard.upcomingMatches")} />
    )
  }

  return (
    <>
      <PageHeader title={t("dashboard.matchesToday")} description={t("dashboard.upcomingMatches")} />
      <div className="flex flex-1 flex-col gap-8 p-5 lg:p-8">
        {/* Hero CTA */}
        <Card className="overflow-hidden border-0 bg-primary shadow-xl shadow-primary/15">
          <CardContent className="flex flex-col items-start gap-4 p-6 sm:flex-row sm:items-center sm:justify-between sm:p-8">
            <div>
              <h2 className="text-2xl font-bold tracking-tight text-primary-foreground sm:text-3xl">
                {t("dashboard.nextMatch")}
              </h2>
              <p className="mt-1 text-base text-primary-foreground/80">
                {t("common.iWantToPlay")}
              </p>
            </div>
            <Button
              size="xl"
              className="shrink-0 bg-primary-foreground text-primary shadow-lg hover:bg-primary-foreground/90"
              onClick={() => setWizardOpen(true)}
            >
              <Zap className="mr-2 h-5 w-5" />
              {t("common.iWantToPlay")}
            </Button>
          </CardContent>
        </Card>

        {/* Matches Today */}
        {matchesToday.length > 0 && (
          <Card className="border-primary/30 bg-gradient-to-br from-primary/5 to-primary/10">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg font-bold tracking-tight">
                  {t("dashboard.matchesToday")}
                </CardTitle>
                <span className="rounded-full bg-primary px-2.5 py-0.5 text-xs font-semibold text-primary-foreground">
                  {matchesToday.length}
                </span>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {matchesToday.map((match) => {
                  const opponent =
                    match.player1.userId === currentUserId ? match.player2 : match.player1
                  return (
                    <div
                      key={match.id}
                      className="flex items-center justify-between rounded-xl border border-border/60 bg-background/80 p-4 backdrop-blur-sm"
                    >
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <p className="text-base font-semibold text-foreground">
                            vs {opponent.name}
                          </p>
                          <MatchTypeBadge type={match.matchType} />
                        </div>
                        <div className="mt-2 flex items-center gap-4 text-sm text-muted-foreground">
                          <span className="flex items-center gap-1.5">
                            <Clock className="h-4 w-4" />
                            {match.time}
                          </span>
                          <span className="flex items-center gap-1.5">
                            <MapPin className="h-4 w-4" />
                            {match.location}
                          </span>
                        </div>
                      </div>
                      <ResultUploadDialog match={match} />
                    </div>
                  )
                })}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Quick Stats */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardContent className="flex items-center gap-4 p-5">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-primary/10">
                <Activity className="h-6 w-6 text-primary" />
              </div>
              <div>
                <p className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                  Level
                </p>
                <p className="font-mono text-3xl font-bold tracking-tight text-foreground">5.2</p>
                <p className="flex items-center gap-1 text-sm text-primary">
                  <TrendingUp className="h-3.5 w-3.5" /> +0.1 this week
                </p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="flex items-center gap-4 p-5">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-primary/10">
                <Target className="h-6 w-6 text-primary" />
              </div>
              <div>
                <p className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                  Win Rate
                </p>
                <p className="font-mono text-3xl font-bold tracking-tight text-foreground">59.6%</p>
                <p className="text-sm text-muted-foreground">28W - 19L</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="flex items-center gap-4 p-5">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-primary/10">
                <Flame className="h-6 w-6 text-primary" />
              </div>
              <div>
                <p className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                  Streak
                </p>
                <p className="font-mono text-3xl font-bold tracking-tight text-primary">2W</p>
                <p className="text-sm text-muted-foreground">Keep it going!</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="flex items-center gap-4 p-5">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-primary/10">
                <Swords className="h-6 w-6 text-primary" />
              </div>
              <div>
                <p className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                  Matches
                </p>
                <p className="font-mono text-3xl font-bold tracking-tight text-foreground">47</p>
                <p className="text-sm text-muted-foreground">32 comp / 15 practice</p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Suggested Opponents */}
        <section>
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-bold tracking-tight text-foreground">
                Suggested Opponents
              </h2>
              <p className="text-base text-muted-foreground">
                3 players you should challenge this week
              </p>
            </div>
            <Button variant="ghost" className="text-base text-primary" asChild>
              <Link to="/suggested">
                View all <ArrowRight className="ml-1 h-5 w-5" />
              </Link>
            </Button>
          </div>
          <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {suggestions.map((suggestion) => (
              <SuggestionCard key={suggestion.player.id} suggestion={suggestion} />
            ))}
          </div>
        </section>

        {/* Invites & Matches */}
        <div className="grid gap-6 lg:grid-cols-2">
          {/* Pending Invites */}
          <Card>
            <CardHeader className="pb-4">
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg font-bold tracking-tight">
                  Pending Invites
                </CardTitle>
                <Button variant="ghost" size="sm" className="gap-1 text-sm text-primary" asChild>
                  <Link to="/play">
                    All <ArrowRight className="h-4 w-4" />
                  </Link>
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {pendingInvites.length === 0 ? (
                <p className="py-12 text-center text-base text-muted-foreground">
                  No pending invites
                </p>
              ) : (
                <div className="space-y-3">
                  {pendingInvites.map((invite) => (
                    <div
                      key={invite.id}
                      className="flex items-center justify-between rounded-2xl border border-border/40 bg-muted/20 p-4 transition-colors hover:bg-muted/40"
                    >
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <p className="text-base font-semibold text-foreground">
                            {invite.fromUserId === currentUserId ? "You" : invite.fromPlayerName}
                          </p>
                          {invite.fromUserId === currentUserId && (
                            <span className="rounded-md bg-muted px-1.5 py-0.5 text-xs font-medium text-muted-foreground">
                              Sent by you
                            </span>
                          )}
                          <MatchTypeBadge type={invite.matchType} />
                          {invite.isOpen && (
                            <span className="rounded-lg bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                              Open
                            </span>
                          )}
                        </div>
                        <div className="mt-2 flex items-center gap-4 text-sm text-muted-foreground">
                          <span className="flex items-center gap-1.5">
                            <Calendar className="h-4 w-4" />
                            {format(new Date(invite.date), "MMM d")}
                          </span>
                          <span className="flex items-center gap-1.5">
                            <Clock className="h-4 w-4" />
                            {invite.time}
                          </span>
                          <span className="flex items-center gap-1.5">
                            <MapPin className="h-4 w-4" />
                            {invite.location}
                          </span>
                        </div>
                      </div>
                      <div className="flex gap-1.5">
                        {invite.fromUserId === currentUserId ? (
                          <Button
                            size="icon"
                            variant="ghost"
                            className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                            onClick={() => handleDeclineInvite(invite.token)}
                          >
                            <XCircle className="h-5 w-5" />
                            <span className="sr-only">Cancel invite</span>
                          </Button>
                        ) : (
                          <>
                            <Button
                              size="icon"
                              variant="ghost"
                              className="text-primary hover:bg-primary/10 hover:text-primary"
                              onClick={() => handleAcceptInvite(invite.token)}
                            >
                              <CheckCircle className="h-5 w-5" />
                              <span className="sr-only">Accept</span>
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                              onClick={() => handleDeclineInvite(invite.token)}
                            >
                              <XCircle className="h-5 w-5" />
                              <span className="sr-only">Decline</span>
                            </Button>
                          </>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Matches */}
          <Card>
            <CardHeader className="pb-0">
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg font-bold tracking-tight">
                  Matches
                </CardTitle>
                <Button variant="ghost" size="sm" className="gap-1 text-sm text-primary" asChild>
                  <Link to="/matches/upcoming">
                    All <ArrowRight className="h-4 w-4" />
                  </Link>
                </Button>
              </div>
              <Tabs defaultValue="upcoming">
                <TabsList className="mt-2">
                  <TabsTrigger value="upcoming" className="text-sm">
                    Upcoming
                  </TabsTrigger>
                  <TabsTrigger value="past" className="text-sm">
                    Past
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="upcoming" className="mt-5">
                  {upcomingMatches.length === 0 ? (
                    <p className="py-12 text-center text-base text-muted-foreground">
                      No upcoming matches
                    </p>
                  ) : (
                    <div className="space-y-3">
                      {upcomingMatches.map((match) => {
                        const opponent =
                          match.player1.userId === currentUserId
                            ? match.player2
                            : match.player1
                        return (
                          <div
                            key={match.id}
                            className="rounded-2xl border border-border/40 bg-muted/20 p-4 transition-colors hover:bg-muted/40"
                          >
                            <Link
                              to={`/matches/${match.id}`}
                              className="flex items-center justify-between"
                            >
                              <div>
                                <div className="flex items-center gap-2">
                                  <p className="text-base font-semibold text-foreground">
                                    vs {opponent.name}
                                  </p>
                                  <MatchTypeBadge type={match.matchType} />
                                </div>
                                <div className="mt-2 flex items-center gap-4 text-sm text-muted-foreground">
                                  <span className="flex items-center gap-1.5">
                                    <Calendar className="h-4 w-4" />
                                    {format(new Date(match.date), "MMM d")}
                                  </span>
                                  <span className="flex items-center gap-1.5">
                                    <Clock className="h-4 w-4" />
                                    {match.time}
                                  </span>
                                </div>
                              </div>
                              <div className="flex items-center gap-3">
                                <span className="font-mono text-sm text-muted-foreground">
                                  Level {opponent.levelValue.toFixed(1)}
                                </span>
                                <StatusBadge status={match.status} />
                              </div>
                            </Link>
                            <div className="mt-3 flex items-center gap-2 border-t border-border/30 pt-3">
                              <AddReminderDialog
                                matchId={match.id}
                                matchDate={match.date}
                                matchTime={match.time}
                                opponent={opponent.name}
                                location={match.location}
                              />
                              <AddToCalendarButton
                                date={match.date}
                                time={match.time}
                                location={match.location}
                                opponent={opponent.name}
                                matchType={match.matchType}
                                compact
                              />
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </TabsContent>

                <TabsContent value="past" className="mt-5">
                  {pastMatches.length === 0 ? (
                    <p className="py-12 text-center text-base text-muted-foreground">
                      No past matches
                    </p>
                  ) : (
                    <div className="space-y-3">
                      {pastMatches.map((match) => {
                        const opponent =
                          match.player1.userId === currentUserId
                            ? match.player2
                            : match.player1
                        const isWinner = match.result?.winnerId === "player-001"
                        return (
                          <Link
                            key={match.id}
                            to={`/matches/${match.id}`}
                            className="flex items-center justify-between rounded-2xl border border-border/40 bg-muted/20 p-4 transition-colors hover:bg-muted/40"
                          >
                            <div>
                              <div className="flex items-center gap-2">
                                <p className="text-base font-semibold text-foreground">
                                  vs {opponent.name}
                                </p>
                                <MatchTypeBadge type={match.matchType} />
                              </div>
                              <div className="mt-2 flex items-center gap-4 text-sm text-muted-foreground">
                                <span>
                                  {format(new Date(match.date), "MMM d")}
                                </span>
                                <span>{match.location}</span>
                              </div>
                            </div>
                            <div className="flex items-center gap-3">
                              {match.result && (
                                <div className="text-right">
                                  <p className="font-mono text-base font-semibold text-foreground">
                                    {match.result.sets
                                      .map(
                                        (s) =>
                                          `${s.player1Score}-${s.player2Score}`
                                      )
                                      .join(" ")}
                                  </p>
                                  <div className="flex items-center justify-end gap-1 text-sm">
                                    {isWinner ? (
                                      <span className="font-medium text-primary">
                                        Won
                                      </span>
                                    ) : (
                                      <span className="text-muted-foreground">
                                        Lost
                                      </span>
                                    )}
                                  </div>
                                </div>
                              )}
                            </div>
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
      </div>

      <IWantToPlayWizard open={wizardOpen} onOpenChange={setWizardOpen} />
    </>
  )
}
