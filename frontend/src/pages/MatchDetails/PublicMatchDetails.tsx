import { useState, useEffect, useRef, useCallback } from "react"
import { Link } from "react-router-dom"
import { format } from "date-fns"
import {
  Calendar,
  Clock,
  MapPin,
  Loader2,
  Zap,
  BarChart2,
  CalendarCheck,
  CheckCircle,
  AlertTriangle,
  Building2,
} from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { SportFormatBadge } from "@/components/sport-format-badge"
import { StatusBadge } from "@/components/status-badge"
import { AddToCalendarButton } from "@/components/add-to-calendar-button"
import { matchesService } from "@/lib/services/matches.service"
import { bookingService, type BookingAttemptDTO } from "@/lib/services/booking.service"
import { useTranslation } from "@/lib/i18n"
import { getBookingErrorMessage } from "@/lib/utils"
import type { Match } from "@/lib/types"

function TennisBallIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="1.5" />
      <path d="M6 3.5C9.5 6 9.5 18 6 20.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M18 3.5C14.5 6 14.5 18 18 20.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )
}

const FEATURES = [
  { key: "scheduling", icon: CalendarCheck },
  { key: "matchmaking", icon: Zap },
  { key: "tracking", icon: BarChart2 },
] as const

interface PublicMatchDetailsProps {
  matchId: string
}

export default function PublicMatchDetails({ matchId }: PublicMatchDetailsProps) {
  const { t } = useTranslation()
  const [match, setMatch] = useState<Match | null>(null)
  const [state, setState] = useState<"loading" | "found" | "not-found">("loading")
  const [bookingAttempt, setBookingAttempt] = useState<BookingAttemptDTO | null>(null)
  const bookingPollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const stopBookingPoll = useCallback(() => {
    if (bookingPollRef.current) {
      clearInterval(bookingPollRef.current)
      bookingPollRef.current = null
    }
  }, [])

  const startBookingPoll = useCallback((id: string) => {
    stopBookingPoll()
    bookingPollRef.current = setInterval(async () => {
      try {
        const attempt = await bookingService.getAttempt(id)
        setBookingAttempt(attempt)
        if (!attempt || attempt.status !== "pending") {
          stopBookingPoll()
        }
      } catch {
        stopBookingPoll()
      }
    }, 3000)
  }, [stopBookingPoll])

  useEffect(() => {
    matchesService.getById(matchId)
      .then((m) => {
        setMatch(m)
        setState("found")
        bookingService.getAttempt(m.id).then((attempt) => {
          setBookingAttempt(attempt)
          if (attempt?.status === "pending") startBookingPoll(m.id)
        }).catch(() => {})
      })
      .catch(() => setState("not-found"))
    return stopBookingPoll
  }, [matchId])

  const participants = match?.participants ?? []
  const isDoubles = participants.length >= 4
  const hasKnownTeams =
    participants.some((p) => p.team === "A") && participants.some((p) => p.team === "B")

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <header className="border-b border-border/40 bg-card/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="mx-auto flex max-w-lg items-center justify-between px-5 py-4">
          <Link to="/" className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary">
              <TennisBallIcon className="h-5 w-5 text-primary-foreground" />
            </div>
            <span className="text-lg font-bold tracking-tight text-foreground">Matchmaker</span>
          </Link>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" asChild>
              <Link to="/login">{t("login.submit")}</Link>
            </Button>
            <Button size="sm" asChild>
              <Link to="/signup">{t("publicMatch.signUp")}</Link>
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-lg flex-1 px-5 py-8 flex flex-col gap-6">
        {/* Loading */}
        {state === "loading" && (
          <div className="flex flex-col items-center justify-center gap-4 py-24">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        )}

        {/* Not found */}
        {state === "not-found" && (
          <>
            <div className="flex flex-col items-center justify-center gap-4 py-24 text-center">
              <p className="text-lg font-semibold text-foreground">{t("matchDetails.notFound")}</p>
              <p className="text-sm text-muted-foreground">{t("publicMatch.notFoundDesc")}</p>
            </div>
            <div className="border-t border-border/40" />
            <MarketingSection t={t} />
          </>
        )}

        {/* Match found */}
        {state === "found" && match && (
          <>
            {/* Match Header Card */}
            <Card
              className={`overflow-hidden border-border/50 ${match.status === "cancelled" ? "border-destructive/30 bg-muted/30" : ""}`}
            >
              {match.status === "cancelled" && (
                <div className="border-b border-destructive/20 bg-destructive/10 px-6 py-3">
                  <p className="text-center text-sm font-semibold text-destructive">
                    {t("common.matchCancelledBanner")}
                  </p>
                </div>
              )}
              <div className="border-b border-border/40 bg-muted/30 px-6 py-4">
                <div className="flex flex-wrap items-center gap-3">
                  <SportFormatBadge
                    sport={match.sport ?? "tennis"}
                    format={match.format ?? (isDoubles ? "doubles" : "singles")}
                  />
                  <StatusBadge status={match.status} />
                </div>
              </div>
              <CardContent className={`p-6 ${match.status === "cancelled" ? "opacity-75" : ""}`}>
                {/* Players display */}
                {isDoubles && hasKnownTeams ? (
                  /* Doubles with teams: two columns separated by vs */
                  <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
                    <div className="flex flex-col items-center gap-2">
                      <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                        {t("matchDetails.teamA")}
                      </span>
                      {participants.filter((p) => p.team === "A").map((p) => (
                        <div key={p.userId} className="flex w-full items-center gap-2">
                          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/20 text-xs font-bold text-primary">
                            {(p.userName ?? "?").split(" ").map((n) => n[0]).join("")}
                          </div>
                          <span className="min-w-0 truncate text-sm font-medium text-foreground">
                            {p.userName ?? t("common.unknown")}
                          </span>
                        </div>
                      ))}
                    </div>
                    <span className="text-xl font-bold text-muted-foreground/40">{t("common.vs")}</span>
                    <div className="flex flex-col items-center gap-2">
                      <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                        {t("matchDetails.teamB")}
                      </span>
                      {participants.filter((p) => p.team === "B").map((p) => (
                        <div key={p.userId} className="flex w-full items-center gap-2">
                          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted-foreground/20 text-xs font-bold text-muted-foreground">
                            {(p.userName ?? "?").split(" ").map((n) => n[0]).join("")}
                          </div>
                          <span className="min-w-0 truncate text-sm font-medium text-foreground">
                            {p.userName ?? t("common.unknown")}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : isDoubles ? (
                  /* Doubles without known teams: 2-column grid */
                  <div className="grid grid-cols-2 gap-2">
                    {participants.map((p) => (
                      <div key={p.userId} className="flex items-center gap-2 rounded-lg bg-muted/40 px-3 py-2">
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold text-muted-foreground">
                          {(p.userName ?? "?").split(" ").map((n) => n[0]).join("")}
                        </div>
                        <span className="min-w-0 truncate text-sm font-medium text-foreground">
                          {p.userName ?? t("common.unknown")}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  /* Singles: player1 vs player2 */
                  <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
                    <div className="flex flex-col items-center gap-2 min-w-0">
                      <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-primary/10 text-base font-bold text-primary">
                        {match.player1.name.split(" ").map((n) => n[0]).join("")}
                      </div>
                      <p className="w-full text-center text-sm font-semibold text-foreground leading-tight break-words">
                        {match.player1.name}
                      </p>
                      {match.player1.levelValue > 0 && (
                        <p className="font-mono text-xs text-muted-foreground">
                          {t("common.level")} {match.player1.levelValue.toFixed(1)}
                        </p>
                      )}
                    </div>
                    <span className="text-xl font-bold text-muted-foreground/40 shrink-0">{t("common.vs")}</span>
                    <div className="flex flex-col items-center gap-2 min-w-0">
                      <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-muted text-base font-bold text-muted-foreground">
                        {match.player2.name.split(" ").map((n) => n[0]).join("")}
                      </div>
                      <p className="w-full text-center text-sm font-semibold text-foreground leading-tight break-words">
                        {match.player2.name}
                      </p>
                      {match.player2.levelValue > 0 && (
                        <p className="font-mono text-xs text-muted-foreground">
                          {t("common.level")} {match.player2.levelValue.toFixed(1)}
                        </p>
                      )}
                    </div>
                  </div>
                )}

                {/* Match info */}
                <div className="mt-6 flex flex-wrap justify-center gap-6 text-sm text-muted-foreground">
                  <span className="flex items-center gap-1.5">
                    <Calendar className="h-4 w-4" />
                    {format(new Date(match.date), "MMM d, yyyy")}
                  </span>
                  <span className="flex items-center gap-1.5">
                    <Clock className="h-4 w-4" />
                    {match.time}
                  </span>
                  {match.location && (
                    <span className="flex items-center gap-1.5">
                      <MapPin className="h-4 w-4" />
                      {match.location}
                    </span>
                  )}
                </div>

                {/* Add to Calendar — when match is scheduled */}
                {(match.status === "scheduled" || match.status === "awaiting_confirmation") && (
                  <div className="mt-6 flex justify-center border-t border-border/30 pt-4">
                    <AddToCalendarButton
                      date={match.date}
                      time={match.time}

                      location={match.location}
                      participants={
                        isDoubles
                          ? participants.map((p) => p.userName ?? "").filter(Boolean)
                          : [match.player1.name, match.player2.name]
                      }
                      matchType={match.matchType}
                      opponentName={isDoubles ? undefined : match.player2.name}
                    />
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Court Booking Status — read-only */}
            {bookingAttempt && bookingAttempt.status !== "cancelled" && (
              <Card className={`border-border/50 ${
                bookingAttempt.status === "success" ? "border-green-500/30 bg-green-500/5" :
                bookingAttempt.status === "failed" ? "border-destructive/30 bg-destructive/5" : ""
              }`}>
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-2 text-base font-semibold tracking-tight">
                    <Building2 className="h-4 w-4" />
                    {t("matchDetails.booking.title")}
                    <span className={`ml-auto rounded-full px-2.5 py-0.5 text-xs font-medium ${
                      bookingAttempt.status === "success"
                        ? "bg-green-500/10 text-green-700 dark:text-green-400"
                        : bookingAttempt.status === "failed"
                        ? "bg-destructive/10 text-destructive"
                        : "bg-amber-500/10 text-amber-700 dark:text-amber-400"
                    }`}>
                      {bookingAttempt.status === "pending" ? t("matchDetails.booking.inProgress") :
                       bookingAttempt.status === "success" ? t("matchDetails.booking.booked") :
                       bookingAttempt.status === "failed" ? t("matchDetails.booking.failed") :
                       bookingAttempt.status}
                    </span>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {bookingAttempt.status === "success" && bookingAttempt.courtName && (
                    <div className="flex items-center gap-2 text-sm">
                      <CheckCircle className="h-4 w-4 text-green-500 shrink-0" />
                      <span>
                        <strong>{bookingAttempt.courtName}</strong> {t("matchDetails.booking.reserved")}
                      </span>
                      {bookingAttempt.externalBookingId && (
                        <span className="text-xs text-muted-foreground">
                          · {t("matchDetails.booking.ref")} {bookingAttempt.externalBookingId}
                        </span>
                      )}
                    </div>
                  )}
                  {bookingAttempt.status === "failed" && (
                    <div className="flex items-start gap-2 text-sm">
                      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
                      <span className="text-destructive">
                        {getBookingErrorMessage(bookingAttempt.errorCode, t, bookingAttempt.errorMessage)}
                      </span>
                    </div>
                  )}
                  {bookingAttempt.status === "pending" && (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      {t("matchDetails.booking.attempting")}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {/* Players Card */}
            <Card className="border-border/50">
              <CardHeader>
                <CardTitle className="text-base font-semibold tracking-tight">
                  {t("matchDetails.players")}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {(isDoubles
                  ? participants.map((p) => ({
                      userId: p.userId,
                      name: p.userName ?? t("common.unknown"),
                      levelValue: 0,
                      city: "",
                    }))
                  : [
                      { userId: match.player1.userId, name: match.player1.name, levelValue: match.player1.levelValue, city: match.player1.city },
                      { userId: match.player2.userId, name: match.player2.name, levelValue: match.player2.levelValue, city: match.player2.city },
                    ]
                ).map((player) => (
                  <div
                    key={player.userId}
                    className="flex items-center gap-4 rounded-xl border border-border/50 bg-muted/20 p-4"
                  >
                    <div className="flex h-11 w-11 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary">
                      {player.name.split(" ").map((n) => n[0]).join("")}
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-medium text-foreground">{player.name}</p>
                      {player.city && <p className="text-xs text-muted-foreground">{player.city}</p>}
                    </div>
                    {player.levelValue > 0 && (
                      <div className="text-right">
                        <p className="font-mono text-sm font-semibold text-foreground">
                          {player.levelValue.toFixed(1)}
                        </p>
                        <p className="text-xs text-muted-foreground">{t("common.level")}</p>
                      </div>
                    )}
                  </div>
                ))}
              </CardContent>
            </Card>

            {/* Divider */}
            <div className="border-t border-border/40" />

            {/* Marketing section */}
            <MarketingSection t={t} />
          </>
        )}
      </main>

      <footer className="border-t border-border/40 bg-card/50 px-5 py-4 text-center">
        <p className="text-xs text-muted-foreground">{t("footer.tagline")}</p>
      </footer>
    </div>
  )
}

function MarketingSection({ t }: { t: (key: string, params?: Record<string, string | number> | string) => string }) {
  return (
    <div className="flex flex-col gap-6">
      <div className="text-center">
        <h2 className="text-xl font-bold tracking-tight text-foreground">
          {t("publicMatch.marketing.title")}
        </h2>
        <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
          {t("publicMatch.marketing.description")}
        </p>
      </div>

      <div className="grid gap-3">
        {FEATURES.map(({ key, icon: Icon }) => (
          <div key={key} className="flex items-start gap-3 rounded-xl border border-border/40 bg-card p-4">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10">
              <Icon className="h-4 w-4 text-primary" />
            </div>
            <div>
              <p className="text-sm font-semibold text-foreground">
                {t(`publicMatch.marketing.features.${key}.title`)}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {t(`publicMatch.marketing.features.${key}.desc`)}
              </p>
            </div>
          </div>
        ))}
      </div>

      <div className="flex flex-col gap-3">
        <Button size="lg" className="w-full font-semibold" asChild>
          <Link to="/signup">{t("publicMatch.marketing.cta")}</Link>
        </Button>
        <p className="text-center text-xs text-muted-foreground">
          {t("publicMatch.marketing.alreadyHaveAccount")}{" "}
          <Link to="/login" className="font-medium text-primary hover:underline">
            {t("login.submit")}
          </Link>
        </p>
      </div>
    </div>
  )
}
