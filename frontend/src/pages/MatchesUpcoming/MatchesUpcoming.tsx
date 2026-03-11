import { useState, useEffect } from "react"
import { format } from "date-fns"
import { Calendar, Clock, MapPin, Loader2, Swords } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { PageHeader } from "@/components/page-header"
import { MatchTypeBadge } from "@/components/match-type-badge"
import { AddReminderDialog } from "@/components/add-reminder-dialog"
import { AddToCalendarButton } from "@/components/add-to-calendar-button"
import { ResultUploadDialog } from "@/components/result-upload-dialog"
import { getCurrentUserId } from "@/lib/current-user"
import { matchesService } from "@/lib/services/matches.service"
import type { Match } from "@/lib/types"

/** Safely format a date string; returns fallback if invalid */
function safeFormatDate(
  value: string | undefined | null,
  formatStr: string,
  fallback = "-"
): string {
  if (!value) return fallback
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? fallback : format(d, formatStr)
}

export default function MatchesPage() {
  const currentUserId = getCurrentUserId()
  const [upcomingMatches, setUpcomingMatches] = useState<Match[]>([])
  const [loading, setLoading] = useState(true)
  const today = format(new Date(), "yyyy-MM-dd")

  useEffect(() => {
    let cancelled = false
    async function fetchMatches() {
      setLoading(true)
      try {
        const list = await matchesService.getUpcoming(currentUserId)
        if (!cancelled) setUpcomingMatches(list)
      } catch {
        if (!cancelled) setUpcomingMatches([])
      } finally {
        if (!cancelled) setLoading(false)
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
  const matchesLater = upcomingMatches.filter((m) => m.date !== today)

  return (
    <>
      <PageHeader
        title="Matches"
        description="Your upcoming and scheduled matches"
      />
      <div className="flex flex-1 flex-col gap-6 p-5 lg:p-8">
        {loading ? (
          <Card>
            <CardContent className="flex items-center justify-center py-20">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </CardContent>
          </Card>
        ) : upcomingMatches.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-20">
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-muted">
                <Swords className="h-8 w-8 text-muted-foreground" />
              </div>
              <p className="mt-4 text-lg font-medium text-foreground">No upcoming matches</p>
              <p className="mt-1 text-base text-muted-foreground">
                Create invites to schedule your next match
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-6">
            {matchesToday.length > 0 && (
              <Card className="border-primary/30 bg-gradient-to-br from-primary/5 to-primary/10">
                <CardHeader>
                  <CardTitle className="text-lg font-bold tracking-tight">
                    Today
                  </CardTitle>
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
                        <div className="flex items-center gap-2">
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
                            opponent={opponent.name}
                            matchType={match.matchType}
                            compact
                          />
                          <ResultUploadDialog match={match} />
                        </div>
                      </div>
                    )
                  })}
                </CardContent>
              </Card>
            )}

            {matchesLater.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg font-bold tracking-tight">
                    Coming up
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
                        className="flex items-center justify-between rounded-xl border border-border/40 bg-muted/20 p-4 transition-colors hover:bg-muted/40"
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
                              <Calendar className="h-4 w-4" />
                              {safeFormatDate(match.date, "EEE, MMM d")}
                            </span>
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
                        <div className="flex items-center gap-2">
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
                            opponent={opponent.name}
                            matchType={match.matchType}
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
      </div>
    </>
  )
}
