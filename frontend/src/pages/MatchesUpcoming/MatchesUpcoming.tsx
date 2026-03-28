import { useState, useEffect, useCallback } from "react"
import { Link } from "react-router-dom"
import { format, parseISO } from "date-fns"
import { es as esLocale, enUS, type Locale } from "date-fns/locale"
import { Calendar, Clock, History, MapPin, Loader2, Swords } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { PageHeader } from "@/components/page-header"
import { SportFormatBadge } from "@/components/sport-format-badge"
import { MatchTypeBadge } from "@/components/match-type-badge"
import { AddReminderDialog } from "@/components/add-reminder-dialog"
import { AddToCalendarButton } from "@/components/add-to-calendar-button"
import { CancelMatchButton } from "@/components/cancel-match-button"
import { ResultUploadDialog } from "@/components/result-upload-dialog"
import { getCurrentUserId } from "@/lib/current-user"
import { matchesService } from "@/lib/services/matches.service"
import type { Match } from "@/lib/types"
import { useTranslation } from "@/lib/i18n"
import { isMatchInPast, matchParticipantsLabel } from "@/lib/utils"

/** Safely format a date string; returns fallback if invalid */
function safeFormatDate(
  value: string | undefined | null,
  formatStr: string,
  locale: Locale,
  fallback = "-"
): string {
  if (!value) return fallback
  const d = parseISO(value)
  const s = Number.isNaN(d.getTime()) ? fallback : format(d, formatStr, { locale })
  return s.charAt(0).toUpperCase() + s.slice(1)
}


export default function MatchesPage() {
  const { t, language } = useTranslation()
  const dateLocale = language === "es" ? esLocale : enUS
  const currentUserId = getCurrentUserId()
  const [upcomingMatches, setUpcomingMatches] = useState<Match[]>([])
  const [pastMatches, setPastMatches] = useState<Match[]>([])
  const [loading, setLoading] = useState(true)
  const [matchTypeFilter, setMatchTypeFilter] = useState<"all" | "competitive" | "practice">("all")
  const today = format(new Date(), "yyyy-MM-dd")

  const fetchAllMatches = useCallback(async () => {
    try {
      const [upcoming, past] = await Promise.all([
        matchesService.getUpcoming(currentUserId),
        matchesService.getPast(currentUserId),
      ])
      setUpcomingMatches(upcoming)
      setPastMatches(past.filter((m) => m.date <= today && m.status !== "cancelled"))
    } catch {
      // silently keep existing state on refetch failure
    }
  }, [currentUserId, today])

  useEffect(() => {
    let cancelled = false
    async function fetch() {
      setLoading(true)
      try {
        const [upcoming, past] = await Promise.all([
          matchesService.getUpcoming(currentUserId),
          matchesService.getPast(currentUserId),
        ])
        if (!cancelled) {
          setUpcomingMatches(upcoming)
          setPastMatches(past.filter((m) => m.date <= today && m.status !== "cancelled"))
        }
      } catch {
        if (!cancelled) {
          setUpcomingMatches([])
          setPastMatches([])
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    fetch()
    return () => {
      cancelled = true
    }
  }, [currentUserId])

  const applyTypeFilter = (matches: Match[]) =>
    matchTypeFilter === "all" ? matches : matches.filter((m) => m.matchType === matchTypeFilter)

  const matchesToday = applyTypeFilter(
    upcomingMatches.filter(
      (m) => m.date === today && (m.status === "scheduled" || m.status === "awaiting_confirmation")
    )
  )
  const matchesLater = applyTypeFilter(
    upcomingMatches.filter(
      (m) => m.date > today && (m.status === "scheduled" || m.status === "awaiting_confirmation")
    )
  )
  const filteredPastMatches = applyTypeFilter(pastMatches)
  const hasUpcoming = matchesToday.length > 0 || matchesLater.length > 0

  function handleMatchCancelled() {
    fetchAllMatches()
  }

  return (
    <>
      <PageHeader
        title={t("matchesUpcoming.title")}
        description={t("matchesUpcoming.description")}
      />
      <div className="flex flex-1 flex-col gap-6 p-4 lg:p-8">
        {loading ? (
          <Card>
            <CardContent className="flex items-center justify-center py-20">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </CardContent>
          </Card>
        ) : !hasUpcoming && pastMatches.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-20">
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-muted">
                <Swords className="h-8 w-8 text-muted-foreground" />
              </div>
              <p className="mt-4 text-lg font-medium text-foreground">{t("matchesUpcoming.noMatches")}</p>
              <p className="mt-1 text-base text-muted-foreground">
                {t("matchesUpcoming.noMatchesDesc")}
              </p>
              <Button size="lg" className="mt-6 gap-2" asChild>
                <Link to="/play">
                  <Calendar className="h-5 w-5" />
                  {t("common.iWantToPlay")}
                </Link>
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-8">
            {/* Match type filter */}
            <div className="flex items-center gap-2">
              {(["all", "competitive", "practice"] as const).map((type) => (
                <button
                  key={type}
                  onClick={() => setMatchTypeFilter(type)}
                  className={`rounded-full px-3 py-1 text-sm font-medium transition-colors ${
                    matchTypeFilter === type
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground hover:bg-muted/80"
                  }`}
                >
                  {type === "all" ? t("common.all") : type === "competitive" ? t("matches.competitive") : t("matches.practice")}
                </button>
              ))}
            </div>

            {/* Upcoming matches */}
            <section>
              {!hasUpcoming ? (
                <Card>
                  <CardContent className="flex flex-col items-center justify-center py-12">
                    <p className="text-muted-foreground">{t("matchesUpcoming.noMatches")}</p>
                    <Button size="sm" className="mt-4 gap-2" asChild>
                      <Link to="/play">
                        <Calendar className="h-4 w-4" />
                        {t("common.iWantToPlay")}
                      </Link>
                    </Button>
                  </CardContent>
                </Card>
              ) : (
                <div className="space-y-4">
                  {matchesToday.length > 0 && (
                    <Card className="border-primary/30 bg-gradient-to-br from-primary/5 to-primary/10">
                      <CardHeader className="pb-3">
                        <CardTitle className="text-lg font-bold tracking-tight">{t("matchesUpcoming.today")}</CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-3 pt-0">
                        {matchesToday.map((match) => {
                          const opponent =
                            match.player1.userId === currentUserId
                              ? match.player2
                              : match.player1
                          return (
                            <div
                              key={match.id}
                              className="rounded-xl border border-border/60 bg-background/80 p-4 backdrop-blur-sm"
                            >
                              {/* Match info */}
                              <Link to={`/matches/${match.id}`} className="block">
                                <div className="flex flex-wrap items-center gap-2">
                                  <SportFormatBadge
                                    sport={match.sport ?? "tennis"}
                                    format={match.format ?? ((match.participants ?? []).length >= 4 ? "doubles" : "singles")}
                                    size="sm"
                                  />
                                  <MatchTypeBadge type={match.matchType} className="text-xs" />
                                  <p className="text-base font-semibold text-foreground">
                                    {matchParticipantsLabel(match, currentUserId, t("common.vs"))}
                                  </p>
                                  {match.status === "awaiting_confirmation" && (
                                    <span className="rounded-full bg-chart-4/15 px-2 py-0.5 text-xs font-medium text-chart-4">
                                      {t("matchesUpcoming.awaiting")}
                                    </span>
                                  )}
                                </div>
                                {match.result && match.result.sets.length > 0 && (
                                  <div className="mt-1 flex items-center gap-2">
                                    {match.result.sets.map((s, i) => {
                                      const myScore = match.player1.userId === currentUserId ? s.player1Score : s.player2Score
                                      const oppScore = match.player1.userId === currentUserId ? s.player2Score : s.player1Score
                                      const iWon = myScore > oppScore
                                      return (
                                        <div key={i} className="flex items-baseline gap-0.5 font-mono">
                                          <span className={iWon ? "text-base font-bold text-foreground" : "text-sm text-muted-foreground/60"}>{myScore}</span>
                                          <span className="text-[10px] text-muted-foreground/30">–</span>
                                          <span className={!iWon ? "text-base font-bold text-foreground" : "text-sm text-muted-foreground/60"}>{oppScore}</span>
                                        </div>
                                      )
                                    })}
                                  </div>
                                )}
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
                              {/* Actions */}
                              <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-border/30 pt-3">
                                {!isMatchInPast(match.date, match.time) && (
                                  <AddReminderDialog
                                    matchId={match.id}
                                    matchDate={match.date}
                                    matchTime={match.time}
                                    opponent={opponent.name}
                                    location={match.location}
                                    userId={currentUserId}
                                  />
                                )}
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
                                  onSuccess={handleMatchCancelled}
                                  compact
                                />
                              </div>
                            </div>
                          )
                        })}
                      </CardContent>
                    </Card>
                  )}

                  {matchesLater.length > 0 && (
                    <Card>
                      <CardHeader className="pb-3">
                        <CardTitle className="text-lg font-bold tracking-tight">{t("matchesUpcoming.comingUp")}</CardTitle>
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
                              {/* Match info */}
                              <Link to={`/matches/${match.id}`} className="block">
                                <div className="flex flex-wrap items-center gap-2">
                                  <SportFormatBadge
                                    sport={match.sport ?? "tennis"}
                                    format={match.format ?? ((match.participants ?? []).length >= 4 ? "doubles" : "singles")}
                                    size="sm"
                                  />
                                  <MatchTypeBadge type={match.matchType} className="text-xs" />
                                  <p className="text-base font-semibold text-foreground">
                                    {matchParticipantsLabel(match, currentUserId, t("common.vs"))}
                                  </p>
                                  {match.status === "awaiting_confirmation" && (
                                    <span className="rounded-full bg-chart-4/15 px-2 py-0.5 text-xs font-medium text-chart-4">
                                      {t("matchesUpcoming.awaiting")}
                                    </span>
                                  )}
                                </div>
                                {match.result && match.result.sets.length > 0 && (
                                  <div className="mt-1 flex items-center gap-2">
                                    {match.result.sets.map((s, i) => {
                                      const myScore = match.player1.userId === currentUserId ? s.player1Score : s.player2Score
                                      const oppScore = match.player1.userId === currentUserId ? s.player2Score : s.player1Score
                                      const iWon = myScore > oppScore
                                      return (
                                        <div key={i} className="flex items-baseline gap-0.5 font-mono">
                                          <span className={iWon ? "text-base font-bold text-foreground" : "text-sm text-muted-foreground/60"}>{myScore}</span>
                                          <span className="text-[10px] text-muted-foreground/30">–</span>
                                          <span className={!iWon ? "text-base font-bold text-foreground" : "text-sm text-muted-foreground/60"}>{oppScore}</span>
                                        </div>
                                      )
                                    })}
                                  </div>
                                )}
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
                              {/* Actions */}
                              <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-border/30 pt-3">
                                {!isMatchInPast(match.date, match.time) && (
                                  <AddReminderDialog
                                    matchId={match.id}
                                    matchDate={match.date}
                                    matchTime={match.time}
                                    opponent={opponent.name}
                                    location={match.location}
                                    userId={currentUserId}
                                  />
                                )}
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
                                  onSuccess={handleMatchCancelled}
                                  compact
                                />
                              </div>
                            </div>
                          )
                        })}
                      </CardContent>
                    </Card>
                  )}
                </div>
              )}
            </section>

            {/* Past matches */}
            <section>
              <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold tracking-tight text-foreground">
                <History className="h-5 w-5 text-muted-foreground" />
                {t("matchesUpcoming.past")}
              </h2>
              {filteredPastMatches.length === 0 ? (
                <Card>
                  <CardContent className="flex items-center justify-center py-12">
                    <p className="text-muted-foreground">{t("matchesUpcoming.noPast")}</p>
                  </CardContent>
                </Card>
              ) : (
                <Card>
                  <CardContent className="space-y-3 pt-4">
                    {filteredPastMatches.map((match) => {
                      return (
                        <Link
                          key={match.id}
                          to={`/matches/${match.id}`}
                          className="block rounded-xl border border-border/40 bg-muted/20 p-4 transition-colors hover:bg-muted/40"
                        >
                          <div className="flex flex-wrap items-center gap-2">
                            <SportFormatBadge
                              sport={match.sport ?? "tennis"}
                              format={match.format ?? ((match.participants ?? []).length >= 4 ? "doubles" : "singles")}
                              size="sm"
                            />
                            <MatchTypeBadge type={match.matchType} className="text-xs" />
                            <p className="text-base font-semibold text-foreground">
                              {matchParticipantsLabel(match, currentUserId, t("common.vs"))}
                            </p>
                            <span
                              className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                                match.status === "completed"
                                  ? "bg-primary/10 text-primary"
                                  : match.status === "cancelled"
                                    ? "bg-destructive/10 text-destructive"
                                    : "bg-muted text-muted-foreground"
                              }`}
                            >
                              {match.status === "completed"
                                ? t("common.confirmed")
                                : match.status === "cancelled"
                                  ? t("common.cancelled")
                                  : match.status === "disputed"
                                    ? t("matchesUpcoming.disputed")
                                    : match.status === "awaiting_confirmation"
                                      ? t("matchesUpcoming.awaiting")
                                      : t("matchesUpcoming.pastStatus")}
                            </span>
                          </div>
                          {match.result && match.result.sets.length > 0 && (
                            <div className="mt-1 flex items-center gap-2">
                              {match.result.winnerUserId && (
                                <span className={`text-xs font-bold px-1.5 py-0.5 rounded ${match.result.winnerUserId === currentUserId ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400" : "bg-destructive/10 text-destructive"}`}>
                                  {match.result.winnerUserId === currentUserId ? "W" : "L"}
                                </span>
                              )}
                              {match.result.sets.map((s, i) => {
                                const myScore = match.player1.userId === currentUserId ? s.player1Score : s.player2Score
                                const oppScore = match.player1.userId === currentUserId ? s.player2Score : s.player1Score
                                const iWon = myScore > oppScore
                                return (
                                  <div key={i} className="flex items-baseline gap-0.5 font-mono">
                                    <span className={iWon ? "text-base font-bold text-foreground" : "text-sm text-muted-foreground/60"}>{myScore}</span>
                                    <span className="text-[10px] text-muted-foreground/30">–</span>
                                    <span className={!iWon ? "text-base font-bold text-foreground" : "text-sm text-muted-foreground/60"}>{oppScore}</span>
                                  </div>
                                )
                              })}
                            </div>
                          )}
                          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
                            <span className="flex items-center gap-1.5">
                              <Calendar className="h-4 w-4 shrink-0" />
                              {safeFormatDate(match.date, "MMM d", dateLocale)}
                            </span>
                            <span className="flex items-center gap-1.5">
                              <MapPin className="h-4 w-4 shrink-0" />
                              {match.location}
                            </span>
                          </div>
                        </Link>
                      )
                    })}
                  </CardContent>
                </Card>
              )}
            </section>
          </div>
        )}
      </div>
    </>
  )
}
