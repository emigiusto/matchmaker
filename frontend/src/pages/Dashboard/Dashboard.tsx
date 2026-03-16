import { useState, useEffect } from "react"
import { Link } from "react-router-dom"
import { format } from "date-fns"
import { es as esLocale, enUS, type Locale } from "date-fns/locale"
import { ArrowRight, Calendar, MapPin, Clock, Zap, Loader2, CirclePlay, Swords } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { PageHeader } from "@/components/page-header"
import { InviteRequestsSection } from "@/components/invite-requests-section"
import { SportFormatBadge } from "@/components/sport-format-badge"
import { IWantToPlayWizard } from "@/components/i-want-to-play-wizard"
import { AddReminderDialog } from "@/components/add-reminder-dialog"
import { AddToCalendarButton } from "@/components/add-to-calendar-button"
import { ResultUploadDialog } from "@/components/result-upload-dialog"
import { CancelMatchButton } from "@/components/cancel-match-button"
import { useTranslation } from "@/lib/i18n/use-translation"
import { getCurrentUserId } from "@/lib/current-user"
import { matchesService } from "@/lib/services/matches.service"
import type { Match } from "@/lib/types"

/** Safely format a date string; returns fallback if invalid */
function safeFormatDate(
  value: string | undefined | null,
  formatStr: string,
  locale: Locale,
  fallback = "-"
): string {
  if (!value) return fallback
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? fallback : format(d, formatStr, { locale })
}

export default function Dashboard() {
  const currentUserId = getCurrentUserId()
  const [wizardOpen, setWizardOpen] = useState(false)
  const [invitesRefreshTrigger, setInvitesRefreshTrigger] = useState(0)
  const [upcomingMatches, setUpcomingMatches] = useState<Match[]>([])
  const [matchesLoading, setMatchesLoading] = useState(true)
  const { t, language } = useTranslation()
  const dateLocale = language === "es" ? esLocale : enUS
  const today = format(new Date(), "yyyy-MM-dd")

  async function refreshMatches() {
    try {
      const list = await matchesService.getUpcoming(currentUserId)
      setUpcomingMatches(list)
    } catch {
      // keep existing state on refresh failure
    }
  }

  useEffect(() => {
    let cancelled = false
    async function fetchMatches() {
      setMatchesLoading(true)
      try {
        const list = await matchesService.getUpcoming(currentUserId)
        if (!cancelled) setUpcomingMatches(list)
      } catch {
        if (!cancelled) setUpcomingMatches([])
      } finally {
        if (!cancelled) setMatchesLoading(false)
      }
    }
    fetchMatches()
    return () => {
      cancelled = true
    }
  }, [currentUserId])

  const matchesToday = upcomingMatches.filter(
    (m) => m.date === today && (m.status === "scheduled" || m.status === "awaiting_confirmation")
  )
  const matchesLater = upcomingMatches.filter(
    (m) => m.date > today && (m.status === "scheduled" || m.status === "awaiting_confirmation")
  )

  return (
    <>
      <PageHeader
        title={t("dashboard.pageTitle")}
        description={t("dashboard.pageDescription")}
      />
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

        {/* Today's matches — highlighted section above tabs */}
        {!matchesLoading && matchesToday.length > 0 && (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <span className="flex h-2 w-2 rounded-full bg-primary animate-pulse" />
              <h2 className="text-sm font-semibold uppercase tracking-wider text-primary">
                {t("matchesUpcoming.today")}
              </h2>
            </div>
            <div className="space-y-3">
              {matchesToday.map((match) => {
                const opponent =
                  match.player1.userId === currentUserId
                    ? match.player2
                    : match.player1
                return (
                  <div
                    key={match.id}
                    className="rounded-xl border border-primary/30 bg-gradient-to-br from-primary/5 to-primary/10 p-4 shadow-sm"
                  >
                    <Link to={`/matches/${match.id}`} className="block">
                      <div className="flex flex-wrap items-center gap-2">
                        <SportFormatBadge
                          sport={match.sport ?? "tennis"}
                          format={match.format ?? ((match.participants ?? []).length >= 4 ? "doubles" : "singles")}
                          size="sm"
                        />
                        <p className="text-base font-semibold text-foreground">
                          {t("common.vs")} {opponent.name}
                        </p>
                      </div>
                      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
                        <span className="flex items-center gap-1.5">
                          <Clock className="h-4 w-4 shrink-0" />
                          {match.time}
                        </span>
                        <span className="flex items-center gap-1.5">
                          <MapPin className="h-4 w-4 shrink-0" />
                          {match.location}
                        </span>
                      </div>
                    </Link>
                    <div className="mt-3 flex items-center gap-2 border-t border-primary/20 pt-3">
                      <AddReminderDialog
                        matchId={match.id}
                        matchDate={match.date}
                        matchTime={match.time}
                        opponent={opponent.name}
                        location={match.location}
                        userId={currentUserId}
                      />
                      <AddToCalendarButton
                        date={match.date}
                        time={match.time}
                        location={match.location}
                        participants={
                          (match.participants ?? []).length >= 4
                            ? (match.participants ?? []).map((p) => p.userName ?? "").filter(Boolean)
                            : [match.player1.name, match.player2.name]
                        }
                        matchType={match.matchType}
                        opponentName={
                          (match.participants ?? []).length >= 4
                            ? undefined
                            : opponent.name
                        }
                        compact
                      />
                      <ResultUploadDialog match={match} />
                      <CancelMatchButton
                        matchId={match.id}
                        userId={currentUserId}
                        onSuccess={refreshMatches}
                        compact
                      />
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Visual divider */}
        <div className="relative flex items-center justify-center py-2">
          <div className="absolute inset-0 flex items-center" aria-hidden>
            <div className="w-full border-t border-border/60" />
          </div>
          <div className="relative flex items-center gap-2 rounded-full border border-border/60 bg-card/80 px-4 py-1.5 backdrop-blur-sm">
            <div className="h-1.5 w-1.5 rounded-full bg-primary/60" />
            <div className="h-1 w-8 rounded-full bg-gradient-to-r from-primary/40 via-primary/70 to-primary/40" />
            <div className="h-1.5 w-1.5 rounded-full bg-primary/60" />
          </div>
        </div>

        {/* Tabs: Invites | Upcoming Matches - avoids long scroll with many invites */}
        <Tabs defaultValue="invites" className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <TabsList className="h-11 w-full rounded-xl bg-muted/60 px-1.5 py-1 sm:w-auto">
              <TabsTrigger value="invites" className="flex-1 gap-2 rounded-lg px-4 data-[state=active]:shadow-md sm:flex-none">
                <CirclePlay className="h-4 w-4" />
                {t("dashboard.invitesTab")}
              </TabsTrigger>
              <TabsTrigger value="matches" className="flex-1 gap-2 rounded-lg px-4 data-[state=active]:shadow-md sm:flex-none">
                <Swords className="h-4 w-4" />
                {t("dashboard.upcomingMatches")}
              </TabsTrigger>
            </TabsList>
            <div className="flex gap-2">
              <Button variant="ghost" size="sm" className="gap-1 text-sm text-primary" asChild>
                <Link to="/play">
                  {t("dashboard.viewAllInvites")} <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
              <Button variant="ghost" size="sm" className="gap-1 text-sm text-primary" asChild>
                <Link to="/matches">
                  {t("dashboard.viewAllMatches")} <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
            </div>
          </div>

          <TabsContent value="invites" className="mt-0">
            <InviteRequestsSection
              currentUserId={currentUserId}
              wizardOpen={wizardOpen}
              setWizardOpen={setWizardOpen}
              variant="embedded"
              renderWizard={false}
              refreshTrigger={invitesRefreshTrigger}
            />
          </TabsContent>

          <TabsContent value="matches" className="mt-0">
          {matchesLoading ? (
            <Card>
              <CardContent className="flex items-center justify-center py-20">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </CardContent>
            </Card>
          ) : matchesLater.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-16">
                <p className="text-center text-base text-muted-foreground">
                  {t("dashboard.noUpcomingMatches")}
                </p>
                <p className="mt-1 text-center text-sm text-muted-foreground">
                  {t("dashboard.noUpcomingMatchesDesc")}
                </p>
                <Button size="lg" className="mt-6 gap-2" onClick={() => setWizardOpen(true)}>
                  <Zap className="h-5 w-5" />
                  {t("common.iWantToPlay")}
                </Button>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base font-semibold">
                  {t("matchesUpcoming.comingUp")}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 pt-0">
                {matchesLater.map((match) => {
                  const opponent =
                    match.player1.userId === currentUserId
                      ? match.player2
                      : match.player1
                  return (
                    <div
                      key={match.id}
                      className="rounded-xl border border-border/40 bg-muted/20 p-4 transition-colors hover:bg-muted/40"
                    >
                      <Link to={`/matches/${match.id}`} className="block">
                        <div className="flex flex-wrap items-center gap-2">
                          <SportFormatBadge
                            sport={match.sport ?? "tennis"}
                            format={match.format ?? ((match.participants ?? []).length >= 4 ? "doubles" : "singles")}
                            size="sm"
                          />
                          <p className="text-base font-semibold text-foreground">
                            {t("common.vs")} {opponent.name}
                          </p>
                        </div>
                        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
                          <span className="flex items-center gap-1.5">
                            <Calendar className="h-4 w-4 shrink-0" />
                            {safeFormatDate(match.date, "EEE, MMM d", dateLocale)}
                          </span>
                          <span className="flex items-center gap-1.5">
                            <Clock className="h-4 w-4 shrink-0" />
                            {match.time}
                          </span>
                          <span className="flex items-center gap-1.5">
                            <MapPin className="h-4 w-4 shrink-0" />
                            {match.location}
                          </span>
                        </div>
                      </Link>
                      <div className="mt-3 flex items-center gap-2 border-t border-border/30 pt-3">
                        <AddReminderDialog
                          matchId={match.id}
                          matchDate={match.date}
                          matchTime={match.time}
                          opponent={opponent.name}
                          location={match.location}
                          userId={currentUserId}
                        />
                        <AddToCalendarButton
                          date={match.date}
                          time={match.time}
                          location={match.location}
                          participants={
                            (match.participants ?? []).length >= 4
                              ? (match.participants ?? []).map((p) => p.userName ?? "").filter(Boolean)
                              : [match.player1.name, match.player2.name]
                          }
                          matchType={match.matchType}
                          opponentName={
                            (match.participants ?? []).length >= 4
                              ? undefined
                              : opponent.name
                          }
                          compact
                        />
                        <CancelMatchButton
                          matchId={match.id}
                          userId={currentUserId}
                          onSuccess={refreshMatches}
                          compact
                        />
                      </div>
                    </div>
                  )
                })}
              </CardContent>
            </Card>
          )}
          </TabsContent>
        </Tabs>
      </div>

      <IWantToPlayWizard
        open={wizardOpen}
        onOpenChange={setWizardOpen}
        hostUserId={currentUserId}
        onSuccess={() => setInvitesRefreshTrigger((t) => t + 1)}
      />
    </>
  )
}
