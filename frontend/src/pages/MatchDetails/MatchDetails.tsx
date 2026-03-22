import { useState, useEffect, useRef, useCallback } from "react"
import { Link, useParams } from "react-router-dom"
import { format, parseISO } from "date-fns"
import { es as esLocale, enUS } from "date-fns/locale"
import {
  ArrowLeft,
  Bell,
  Calendar,
  Clock,
  MapPin,
  CheckCircle,
  AlertTriangle,
  TrendingUp,
  TrendingDown,
  Check,
  XCircle,
  Trash2,
  Building2,
  RefreshCw,
  Ban,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { PageHeader } from "@/components/page-header"
import { StatusBadge } from "@/components/status-badge"
import { SportFormatBadge } from "@/components/sport-format-badge"
import { AddReminderDialog } from "@/components/add-reminder-dialog"
import { AddToCalendarButton } from "@/components/add-to-calendar-button"
import { CancelMatchButton } from "@/components/cancel-match-button"
import { RescheduleMatchDialog } from "@/components/reschedule-match-dialog"
import { toast } from "sonner"
import { useTranslation } from "@/lib/i18n"
import { useAuth } from "@/lib/auth/AuthContext"
import { isMatchInPast, getBookingErrorMessage } from "@/lib/utils"
import { getCurrentUserId } from "@/lib/current-user"
import { matchesService } from "@/lib/services/matches.service"
import { remindersService, type Reminder } from "@/lib/services/reminders.service"
import { bookingService, type BookingAttemptDTO, type ClubMembershipDTO, SUPPORTED_CLUBS } from "@/lib/services/booking.service"
import { contactsService, type ContactDTO } from "@/lib/services/contacts.service"
import { Input } from "@/components/ui/input"
import type { Match } from "@/lib/types"
import { Loader2 } from "lucide-react"

export default function MatchDetailPage() {
  const { id } = useParams<{ id: string }>()
  const { t, language } = useTranslation()
  const { isAdmin } = useAuth()
  const dateLocale = language === "es" ? esLocale : enUS
  const currentUserId = getCurrentUserId()
  const [match, setMatch] = useState<Match | null>(null)
  const [loading, setLoading] = useState(true)
  const [reminders, setReminders] = useState<Reminder[]>([])
  const [remindersLoading, setRemindersLoading] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [resultSubmitted, _setResultSubmitted] = useState(false)
  const [disputeOpen, setDisputeOpen] = useState(false)
  const [bookingAttempt, setBookingAttempt] = useState<BookingAttemptDTO | null>(null)
  const [retryingBooking, setRetryingBooking] = useState(false)
  const [cancellingBooking, setCancellingBooking] = useState(false)
  const [cancelBookingError, setCancelBookingError] = useState<string | null>(null)
  const [fetchingGroupLink, setFetchingGroupLink] = useState(false)
  const [hostMemberships, setHostMemberships] = useState<ClubMembershipDTO[]>([])
  const [selectedMembershipId, setSelectedMembershipId] = useState<string | null>(null)
  const [contacts, setContacts] = useState<ContactDTO[]>([])
  const [socioEdits, setSocioEdits] = useState<Record<string, string>>({})
  const [savingSocioFor, setSavingSocioFor] = useState<string | null>(null)
  const bookingPollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  function fetchReminders() {
    if (!currentUserId) return
    setRemindersLoading(true)
    remindersService
      .listByUser(currentUserId)
      .then((list) => setReminders(list.filter((r) => r.matchId === id)))
      .catch(() => setReminders([]))
      .finally(() => setRemindersLoading(false))
  }

  useEffect(() => {
    if (!id) {
      setLoading(false)
      return
    }
    let cancelled = false
    matchesService
      .getById(id)
      .then((m) => {
        if (!cancelled) setMatch(m)
      })
      .catch(() => {
        if (!cancelled) setMatch(null)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => { cancelled = true }
  }, [id])

  useEffect(() => {
    if (id && currentUserId) fetchReminders()
  }, [id, currentUserId])

  const stopBookingPoll = useCallback(() => {
    if (bookingPollRef.current) {
      clearInterval(bookingPollRef.current)
      bookingPollRef.current = null
    }
  }, [])

  const startBookingPoll = useCallback((matchId: string) => {
    stopBookingPoll()
    bookingPollRef.current = setInterval(async () => {
      try {
        const attempt = await bookingService.getAttempt(matchId)
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
    if (!id) return
    bookingService.getAttempt(id).then((attempt) => {
      setBookingAttempt(attempt)
      if (attempt?.status === "pending") startBookingPoll(id)
    }).catch(() => {})
    return stopBookingPoll
  }, [id])

  // Load memberships and contacts to enable booking + socio editing.
  // Both come from the actual host (availability owner), not just participants[0].
  useEffect(() => {
    const hostId = match?.hostUserId ?? match?.player1.userId
    if (!match || !currentUserId || !hostId || (hostId !== currentUserId && !isAdmin)) return
    bookingService.listMemberships(hostId).then((m) => {
      setHostMemberships(m)
      setSelectedMembershipId((prev) => prev ?? m[0]?.id ?? null)
    }).catch(() => {})
    contactsService.list(hostId).then(setContacts).catch(() => {})
  }, [match?.id, match?.hostUserId, currentUserId, isAdmin])

  async function handleRetryBooking() {
    if (!id || !selectedMembershipId) return
    setRetryingBooking(true)
    try {
      await bookingService.retryBooking(id, selectedMembershipId)
      // Re-fetch so we get the real attempt record (handles both fresh start and retry)
      const attempt = await bookingService.getAttempt(id)
      setBookingAttempt(attempt)
      toast.success(t("matchDetails.booking.toast.retryQueued"))
      startBookingPoll(id)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("matchDetails.booking.toast.retryFailed"))
    } finally {
      setRetryingBooking(false)
    }
  }

  async function handleCancelBooking() {
    if (!id) return
    setCancellingBooking(true)
    setCancelBookingError(null)
    try {
      await bookingService.cancelBooking(id)
      setBookingAttempt((prev) => prev ? { ...prev, status: "cancelled" } : prev)
      toast.success(t("matchDetails.booking.toast.cancelSuccess"))
    } catch (err) {
      setCancelBookingError(err instanceof Error ? err.message : t("matchDetails.booking.toast.cancelFailed"))
    } finally {
      setCancellingBooking(false)
    }
  }

  async function handleSaveSocio(contact: ContactDTO, clubSlug: string) {
    const value = socioEdits[contact.id]
    if (value === undefined) return
    setSavingSocioFor(contact.id)
    try {
      await contactsService.updateSocioNumber(contact.id, match!.hostUserId ?? match!.player1.userId, contact.socioNumbers, clubSlug, value.trim())
      setContacts((prev) =>
        prev.map((c) =>
          c.id === contact.id
            ? { ...c, socioNumbers: { ...c.socioNumbers, [clubSlug]: value.trim() } }
            : c
        )
      )
      setSocioEdits((prev) => { const next = { ...prev }; delete next[contact.id]; return next })
      toast.success(t("matchDetails.booking.socioSaved"))
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("error.somethingWentWrong"))
    } finally {
      setSavingSocioFor(null)
    }
  }

  async function handleOpenWhatsappGroup() {
    if (!id) return
    setFetchingGroupLink(true)
    try {
      const link = await matchesService.getWhatsappGroupLink(id)
      window.open(link, "_blank", "noopener,noreferrer")
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to get WhatsApp group link")
    } finally {
      setFetchingGroupLink(false)
    }
  }

  async function handleDeleteReminder(reminderId: string) {
    setDeletingId(reminderId)
    try {
      await remindersService.delete(reminderId, currentUserId)
      fetchReminders()
      toast.success("Reminder removed")
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to delete reminder")
    } finally {
      setDeletingId(null)
    }
  }

  if (loading) {
    return (
      <>
        <PageHeader title={t("matchDetails.title")} />
        <div className="flex flex-1 items-center justify-center p-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </>
    )
  }

  if (!match) {
    return (
      <>
        <PageHeader title={t("matchDetails.title")} />
        <div className="flex flex-1 items-center justify-center p-8">
          <div className="text-center">
            <p className="text-sm text-muted-foreground">{t("matchDetails.notFound")}</p>
            <Button variant="ghost" className="mt-4" asChild>
              <Link to="/">{t("common.back")}</Link>
            </Button>
          </div>
        </div>
      </>
    )
  }

  const isPlayer1 = match.player1.userId === currentUserId
  const hostUserId = match.hostUserId ?? match.player1.userId
  const isHost = hostUserId === currentUserId
  const opponent = isPlayer1 ? match.player2 : match.player1
  const currentPlayer = isPlayer1 ? match.player1 : match.player2

  // Non-host participants for socio number editing (always exclude the host, not the viewer)
  const otherParticipants: Array<{ userId: string; name: string }> =
    match.participants && match.participants.length > 0
      ? match.participants
          .filter((p) => p.userId !== hostUserId)
          .map((p) => ({ userId: p.userId, name: p.userName ?? "" }))
      : [{ userId: opponent.userId, name: opponent.name }]

  const primaryClubSlug = hostMemberships[0]?.clubSlug ?? null

  const allParticipantsHaveSocio =
    !primaryClubSlug ||
    otherParticipants.every((p) => {
      const contact = contacts.find((c) => c.linkedUserId === p.userId)
      return !!contact?.socioNumbers?.[primaryClubSlug]
    })

  function handleConfirmResult() {
    toast.success("Result confirmed!")
  }

  function handleDisputeResult(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setDisputeOpen(false)
    toast.success("Dispute submitted")
  }

  return (
    <>
      <PageHeader title={t("matchDetails.title")}>
        <Button variant="ghost" size="sm" asChild>
          <Link to="/">
            <ArrowLeft className="mr-1.5 h-4 w-4" /> {t("common.back")}
          </Link>
        </Button>
      </PageHeader>
      <div className="flex flex-1 flex-col gap-6 p-4 lg:p-8">
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
                format={match.format ?? ((match.participants ?? []).length >= 4 ? "doubles" : "singles")}
              />
              <StatusBadge status={match.status} />
            </div>
          </div>
          <CardContent className={`p-6 ${match.status === "cancelled" ? "opacity-75" : ""}`}>
            {/* Players display: vs when teams known; participant list for doubles before result */}
            {match.showVsLayout !== false ? (
              (match.participants ?? []).length >= 4 ? (
                /* Doubles with teams: Team A vs Team B — all 4 players */
                <div className="flex items-center justify-center gap-3 sm:gap-8">
                  <div className="flex flex-col items-center gap-3">
                    <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{t("matchDetails.teamA")}</span>
                    <div className="flex flex-wrap justify-center gap-3">
                      {(match.participants ?? [])
                        .filter((p) => p.team === "A")
                        .map((p) => (
                          <div key={p.userId} className="flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1.5">
                            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/20 text-xs font-bold text-primary">
                              {(p.userName ?? "?").split(" ").map((n) => n[0]).join("")}
                            </div>
                            <span className="text-sm font-medium">{p.userName ?? t("common.unknown")}</span>
                          </div>
                        ))}
                    </div>
                  </div>
                  <div className="flex flex-col items-center gap-1">
                    <span className="text-2xl font-bold text-muted-foreground/40">{t("common.vs")}</span>
                    {match.result && (
                      <p className="font-mono text-lg font-bold text-foreground">
                        {match.result.sets.map((s) => `${s.player1Score}-${s.player2Score}`).join(" ")}
                      </p>
                    )}
                  </div>
                  <div className="flex flex-col items-center gap-3">
                    <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{t("matchDetails.teamB")}</span>
                    <div className="flex flex-wrap justify-center gap-3">
                      {(match.participants ?? [])
                        .filter((p) => p.team === "B")
                        .map((p) => (
                          <div key={p.userId} className="flex items-center gap-2 rounded-full bg-muted px-3 py-1.5">
                            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-muted-foreground/20 text-xs font-bold text-muted-foreground">
                              {(p.userName ?? "?").split(" ").map((n) => n[0]).join("")}
                            </div>
                            <span className="text-sm font-medium">{p.userName ?? t("common.unknown")}</span>
                          </div>
                        ))}
                    </div>
                  </div>
                </div>
              ) : (
                /* Singles: 1 vs 1 */
                <div className="flex items-center justify-center gap-3 sm:gap-8">
                  <div className="flex flex-col items-center gap-2">
                    <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-primary/10 text-lg font-bold text-primary">
                      {currentPlayer.name.split(" ").map((n) => n[0]).join("")}
                    </div>
                    <div className="w-20 text-center">
                      <p className="truncate text-sm font-semibold text-foreground">{currentPlayer.name}</p>
                      <p className="font-mono text-xs text-muted-foreground">{t("common.level")} {currentPlayer.levelValue.toFixed(1)}</p>
                    </div>
                  </div>
                  <div className="flex shrink-0 flex-col items-center gap-1">
                    <span className="text-2xl font-bold text-muted-foreground/40">{t("common.vs")}</span>
                    {match.result && (
                      <p className="font-mono text-lg font-bold text-foreground">
                        {match.result.sets.map((s) => `${s.player1Score}-${s.player2Score}`).join(" ")}
                      </p>
                    )}
                  </div>
                  <div className="flex flex-col items-center gap-2">
                    <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-muted text-lg font-bold text-muted-foreground">
                      {opponent.name.split(" ").map((n) => n[0]).join("")}
                    </div>
                    <div className="w-20 text-center">
                      <p className="truncate text-sm font-semibold text-foreground">{opponent.name}</p>
                      <p className="font-mono text-xs text-muted-foreground">{t("common.level")} {opponent.levelValue.toFixed(1)}</p>
                    </div>
                  </div>
                </div>
              )
            ) : (
              /* Doubles before result: teams unknown, list all participants */
              <div className="flex flex-col items-center gap-4">
                <p className="text-sm text-muted-foreground">{t("matchDetails.doublesNote")}</p>
                <div className="flex flex-wrap justify-center gap-4">
                  {(match.participants ?? []).map((p) => (
                    <div key={p.userId} className="flex items-center gap-2 rounded-full bg-muted/50 px-4 py-2">
                      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted text-sm font-semibold text-muted-foreground">
                        {(p.userName ?? "?").split(" ").map((n) => n[0]).join("")}
                      </div>
                      <span className="text-sm font-medium">{p.userName ?? t("common.unknown")}</span>
                    </div>
                  ))}
                </div>
                {match.result && (
                  <p className="font-mono text-lg font-bold text-foreground">
                    {match.result.sets.map((s) => `${s.player1Score}-${s.player2Score}`).join(" ")}
                  </p>
                )}
              </div>
            )}

            {/* Match info */}
            <div className="mt-6 flex flex-wrap justify-center gap-6 text-sm text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <Calendar className="h-4 w-4" />
                {format(parseISO(match.date), "MMM d, yyyy", { locale: dateLocale })}
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

            {/* Add to Calendar + Cancel - when match is scheduled */}
            {(match.status === "scheduled" || match.status === "awaiting_confirmation") && (
              <div className="mt-6 flex flex-wrap justify-center gap-3 border-t border-border/30 pt-4">
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
                />
                <RescheduleMatchDialog
                  matchId={match.id}
                  userId={currentUserId}
                  match={match}
                  onSuccess={(m) => {
                    setMatch(m)
                    if (id) {
                      bookingService.getAttempt(id).then((attempt) => {
                        setBookingAttempt(attempt)
                        if (attempt?.status === "pending") startBookingPoll(id)
                      }).catch(() => {})
                    }
                  }}
                />
                <CancelMatchButton
                  matchId={match.id}
                  userId={currentUserId}
                  onSuccess={(m) => setMatch(m)}
                />
              </div>
            )}
          </CardContent>
        </Card>

        {/* Court Booking Status */}
        {(isHost || isAdmin) && (
          <Card className={`border-border/50 ${
            bookingAttempt?.status === "success" ? "border-green-500/30 bg-green-500/5" :
            bookingAttempt?.status === "failed" ? "border-destructive/30 bg-destructive/5" :
            bookingAttempt?.status === "cancelled" ? "border-muted bg-muted/20" : ""
          }`}>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base font-semibold tracking-tight">
                <Building2 className="h-4 w-4" />
                {t("matchDetails.booking.title")}
                {bookingAttempt && (
                  <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
                    bookingAttempt.status === "success"
                      ? "bg-green-500/10 text-green-700 dark:text-green-400"
                      : bookingAttempt.status === "failed"
                      ? "bg-destructive/10 text-destructive"
                      : "bg-amber-500/10 text-amber-700 dark:text-amber-400"
                  }`}>
                    {bookingAttempt.status === "pending" ? t("matchDetails.booking.inProgress") :
                     bookingAttempt.status === "success" ? t("matchDetails.booking.booked") :
                     bookingAttempt.status === "failed" ? t("matchDetails.booking.failed") :
                     bookingAttempt.status === "cancelled" ? t("matchDetails.booking.cancelled") : bookingAttempt.status}
                  </span>
                )}
                {/* Club selector — right-aligned */}
                <div className="ml-auto">
                  {hostMemberships.length > 1 ? (
                    <Select value={selectedMembershipId ?? undefined} onValueChange={setSelectedMembershipId}>
                      <SelectTrigger className="h-7 text-xs w-40">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {hostMemberships.map((m) => (
                          <SelectItem key={m.id} value={m.id}>
                            {SUPPORTED_CLUBS.find((c) => c.clubSlug === m.clubSlug)?.label ?? m.clubSlug}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : hostMemberships.length === 1 ? (
                    <span className="text-xs text-muted-foreground font-normal">
                      {SUPPORTED_CLUBS.find((c) => c.clubSlug === hostMemberships[0].clubSlug)?.label ?? hostMemberships[0].clubSlug}
                    </span>
                  ) : null}
                </div>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {hostMemberships.length === 0 && (
                <p className="text-sm text-muted-foreground">
                  {isHost
                    ? t("matchDetails.booking.noMembership")
                    : t("matchDetails.booking.hostNoMembership")}
                </p>
              )}
              {hostMemberships.length > 0 && !allParticipantsHaveSocio && (
                <div className="flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/5 p-2.5 text-sm text-amber-700 dark:text-amber-400">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>{t("matchDetails.booking.missingSocioNumbers")}</span>
                </div>
              )}
              {hostMemberships.length > 0 && !bookingAttempt && (
                <div className="space-y-3">
                  {match.bookingEnabled && (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      {t("matchDetails.booking.attempting")}
                    </div>
                  )}
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-2"
                    onClick={handleRetryBooking}
                    disabled={retryingBooking || !allParticipantsHaveSocio || !selectedMembershipId}
                  >
                    {retryingBooking
                      ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      : <RefreshCw className="h-3.5 w-3.5" />
                    }
                    {match.bookingEnabled ? t("matchDetails.booking.retryBooking") : t("matchDetails.booking.bookCourt")}
                  </Button>
                </div>
              )}
              {bookingAttempt?.status === "success" && (
                <div className="space-y-3">
                  {bookingAttempt.courtName && (
                    <div className="flex items-center gap-2 text-sm">
                      <CheckCircle className="h-4 w-4 text-green-500" />
                      <span><strong>{bookingAttempt.courtName}</strong> {t("matchDetails.booking.reserved")}</span>
                      {bookingAttempt.externalBookingId && (
                        <span className="text-xs text-muted-foreground">
                          · {t("matchDetails.booking.ref")} {bookingAttempt.externalBookingId}
                        </span>
                      )}
                    </div>
                  )}
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-2 text-destructive hover:text-destructive"
                    onClick={handleCancelBooking}
                    disabled={cancellingBooking}
                  >
                    {cancellingBooking
                      ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      : <Ban className="h-3.5 w-3.5" />
                    }
                    {cancellingBooking ? t("matchDetails.booking.cancellingBooking") : t("matchDetails.booking.cancelBooking")}
                  </Button>
                  {cancelBookingError && (
                    <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-2.5 text-sm text-destructive">
                      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                      <span>{cancelBookingError}</span>
                    </div>
                  )}
                </div>
              )}
              {bookingAttempt?.status === "failed" && (
                <div className="space-y-3">
                  <div className="flex items-start gap-2 text-sm">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
                    <span className="text-destructive">
                      {getBookingErrorMessage(bookingAttempt.errorCode, t)}
                    </span>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-2"
                    onClick={handleRetryBooking}
                    disabled={retryingBooking || !allParticipantsHaveSocio}
                  >
                    {retryingBooking
                      ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      : <RefreshCw className="h-3.5 w-3.5" />
                    }
                    {t("matchDetails.booking.retryBooking")}
                  </Button>
                </div>
              )}
              {bookingAttempt?.status === "pending" && (() => {
                const stale = Date.now() - new Date(bookingAttempt.attemptedAt).getTime() > 10 * 60 * 1000
                return stale ? (
                  <div className="space-y-3">
                    <div className="flex items-start gap-2 text-sm">
                      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
                      <span className="text-destructive">{t("matchDetails.booking.timedOut")}</span>
                    </div>
                    <Button variant="outline" size="sm" className="gap-2" onClick={handleRetryBooking} disabled={retryingBooking}>
                      {retryingBooking ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                      {t("matchDetails.booking.retryBooking")}
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      {t("matchDetails.booking.attempting")}
                    </div>
                    <p className="pl-6 text-xs text-muted-foreground">{t("matchDetails.booking.attemptingNote")}</p>
                  </div>
                )
              })()}

              {/* Participant socio numbers — only visible to the host or admin */}
              {(isHost || isAdmin) && primaryClubSlug && otherParticipants.length > 0 && (
                <div className="border-t border-border/40 pt-3 space-y-2">
                  <p className="text-xs font-medium text-muted-foreground">
                    {t("matchDetails.booking.participantSocios", { club: primaryClubSlug })}
                  </p>
                  {otherParticipants.map((p) => {
                    const contact = contacts.find((c) => c.linkedUserId === p.userId)
                    const current = contact?.socioNumbers?.[primaryClubSlug] ?? ""
                    const draft = socioEdits[contact?.id ?? ""]
                    const displayValue = draft !== undefined ? draft : current
                    const isDirty = draft !== undefined && draft !== current
                    return (
                      <div key={p.userId} className="flex items-center gap-2">
                        <span className="w-28 shrink-0 truncate text-sm">{p.name}</span>
                        {contact ? (
                          <>
                            <Input
                              className="h-7 text-sm"
                              placeholder={t("matchDetails.booking.socioPlaceholder")}
                              value={displayValue}
                              onChange={(e) =>
                                setSocioEdits((prev) => ({ ...prev, [contact.id]: e.target.value }))
                              }
                            />
                            {isDirty && (
                              <Button
                                size="sm"
                                className="h-7 px-2.5 text-xs"
                                onClick={() => handleSaveSocio(contact, primaryClubSlug)}
                                disabled={savingSocioFor === contact.id}
                              >
                                {savingSocioFor === contact.id
                                  ? <Loader2 className="h-3 w-3 animate-spin" />
                                  : t("form.save")
                                }
                              </Button>
                            )}
                          </>
                        ) : (
                          <span className="text-xs text-muted-foreground italic">
                            {t("matchDetails.booking.notInContacts")}
                          </span>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* WhatsApp Group */}
        {match.whatsappGroupId && (
          <Card className="border-border/50">
            <CardContent className="pt-4">
              <Button
                className="w-full gap-2 bg-[#25D366] text-white hover:bg-[#25D366]/90"
                onClick={handleOpenWhatsappGroup}
                disabled={fetchingGroupLink}
              >
                {fetchingGroupLink
                  ? <Loader2 className="h-4 w-4 animate-spin" />
                  : <CheckCircle className="h-4 w-4" />
                }
                {t("matchDetails.openWhatsappGroup")}
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Reminders */}
        <Card className="border-border/50">
          <CardHeader>
            <CardTitle className="text-base font-semibold tracking-tight flex items-center gap-2">
              <Bell className="h-4 w-4" />
              {t("matchDetails.reminders.title")}
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              {match.status === "cancelled"
                ? t("matchDetails.reminders.matchCancelled")
                : t("matchDetails.reminders.description")}
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            {(match.status === "scheduled" || match.status === "awaiting_confirmation") && !isMatchInPast(match.date, match.time) && (
              <div className="mb-4">
                <AddReminderDialog
                  matchId={match.id}
                  matchDate={match.date}
                  matchTime={match.time}
                  opponent={opponent.name}
                  location={match.location}
                  userId={currentUserId}
                  onSuccess={fetchReminders}
                  trigger={
                    <Button variant="outline" size="lg" className="gap-2">
                      <Bell className="h-5 w-5" />
                      {t("matchDetails.reminders.addReminder")}
                    </Button>
                  }
                />
              </div>
            )}
            <div>
              <h4 className="text-sm font-medium text-foreground mb-2">{t("matchDetails.reminders.yourReminders")}</h4>
              {remindersLoading ? (
                <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {t("matchDetails.reminders.loading")}
                </div>
              ) : reminders.length === 0 ? (
                <p className="py-4 text-sm text-muted-foreground">
                  {(match.status === "scheduled" || match.status === "awaiting_confirmation")
                    ? t("matchDetails.reminders.noReminders")
                    : t("matchDetails.reminders.noRemindersSet")}
                </p>
              ) : (
                <ul className="space-y-2">
                  {reminders.map((r) => (
                    <li
                      key={r.id}
                      className="flex items-center justify-between rounded-lg border border-border/40 bg-muted/20 px-4 py-3"
                    >
                      <div className="flex items-center gap-3">
                        {r.status === "pending" && (
                          <Clock className="h-4 w-4 text-amber-500" />
                        )}
                        {r.status === "sent" && (
                          <Check className="h-4 w-4 text-green-600" />
                        )}
                        {r.status === "failed" && (
                          <XCircle className="h-4 w-4 text-destructive" />
                        )}
                        <div>
                          <p className="text-sm font-medium text-foreground">
                            {format(new Date(r.scheduledAt), "EEE, MMM d, HH:mm", { locale: dateLocale })}
                          </p>
                          {r.status === "sent" && r.sentAt && (
                            <p className="text-xs text-muted-foreground">
                              {t("common.reminderSent")} {format(new Date(r.sentAt), "MMM d, HH:mm", { locale: dateLocale })}
                            </p>
                          )}
                          {r.status === "failed" && r.error && (
                            <p className="text-xs text-destructive">{r.error}</p>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span
                          className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
                            r.status === "pending"
                              ? "bg-amber-500/10 text-amber-700 dark:text-amber-400"
                              : r.status === "sent"
                              ? "bg-green-500/10 text-green-700 dark:text-green-400"
                              : "bg-destructive/10 text-destructive"
                          }`}
                        >
                          {r.status === "sent" ? t("common.reminderSent") : r.status === "failed" ? t("common.reminderFailed") : t("common.reminderPending")}
                        </span>
                        {r.status === "pending" && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive"
                            onClick={() => handleDeleteReminder(r.id)}
                            disabled={deletingId === r.id}
                            title={t("matchDetails.reminders.removeReminder")}
                          >
                            {deletingId === r.id ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <Trash2 className="h-4 w-4" />
                            )}
                          </Button>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </CardContent>
        </Card>

        <div className="grid gap-6 lg:grid-cols-2">
          {/* Result Section */}
          {match.result ? (
            <>
              <Card className="border-border/50">
                <CardHeader>
                  <CardTitle className="text-base font-semibold tracking-tight">
                    {t("matchDetails.result.title")}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    {match.result.sets.map((set) => (
                      <div
                        key={set.setNumber}
                        className="flex items-center justify-between rounded-lg bg-muted/30 px-4 py-2.5"
                      >
                        <span className="text-xs font-medium text-muted-foreground">
                          {t("matchDetails.result.set", { number: set.setNumber })}
                        </span>
                        <span className="font-mono text-sm font-semibold text-foreground">
                          {set.player1Score} - {set.player2Score}
                        </span>
                      </div>
                    ))}
                  </div>

                  {match.result.player1RatingChange !== undefined && (
                    <div className="flex items-center gap-4 rounded-lg border border-border/50 p-3">
                      <div className="flex items-center gap-2">
                        {match.result.player1RatingChange > 0 ? (
                          <TrendingUp className="h-4 w-4 text-primary" />
                        ) : (
                          <TrendingDown className="h-4 w-4 text-destructive" />
                        )}
                        <span className="text-xs text-muted-foreground">{t("matchDetails.result.ratingChange")}</span>
                        <span
                          className={`font-mono text-sm font-semibold ${
                            match.result.player1RatingChange > 0
                              ? "text-primary"
                              : "text-destructive"
                          }`}
                        >
                          {match.result.player1RatingChange > 0 ? "+" : ""}
                          {match.result.player1RatingChange}
                        </span>
                      </div>
                    </div>
                  )}

                  {match.matchType === "competitive" && (
                    <div className="rounded-lg border border-border/50 bg-muted/30 p-3">
                      <p className="text-xs font-medium text-muted-foreground">{t("matchDetails.result.status")}</p>
                      <p className="mt-1 text-sm font-semibold text-foreground">
                        {match.status === "awaiting_confirmation"
                          ? t("matchDetails.result.awaitingConfirmation")
                          : t("matchDetails.result.confirmed")}
                      </p>
                    </div>
                  )}

                  {match.status === "awaiting_confirmation" && (
                    <div className="flex gap-2">
                      <Button size="sm" onClick={handleConfirmResult}>
                        <CheckCircle className="mr-1.5 h-4 w-4" />
                        {t("matchDetails.result.confirmResult")}
                      </Button>
                      <Dialog open={disputeOpen} onOpenChange={setDisputeOpen}>
                        <DialogTrigger asChild>
                          <Button size="sm" variant="outline">
                            <AlertTriangle className="mr-1.5 h-4 w-4" />
                            {t("matchDetails.result.dispute")}
                          </Button>
                        </DialogTrigger>
                        <DialogContent>
                          <DialogHeader>
                            <DialogTitle>{t("matchDetails.result.disputeTitle")}</DialogTitle>
                          </DialogHeader>
                          <form onSubmit={handleDisputeResult} className="space-y-4">
                            <div className="space-y-2">
                              <Label className="text-xs font-medium">{t("matchDetails.result.disputeReason")}</Label>
                              <Textarea
                                placeholder={t("matchDetails.result.disputePlaceholder")}
                                required
                              />
                            </div>
                            <Button type="submit" variant="destructive" className="w-full">
                              {t("matchDetails.result.submitDispute")}
                            </Button>
                          </form>
                        </DialogContent>
                      </Dialog>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Show Questionnaire Answers if available */}
              {match.result.questionnaire && Object.keys(match.result.questionnaire).length > 0 && (
                <Card className="border-border/50">
                  <CardHeader>
                    <CardTitle className="text-base font-semibold tracking-tight">
                      Match Insights
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {match.result.questionnaire.matchPlayedOut &&
                      match.result.questionnaire.matchPlayedOut.length > 0 && (
                        <QuestionnaireItem
                          label="Match intensity"
                          value={formatQuestionnaireArrayValues(
                            match.result.questionnaire.matchPlayedOut
                          )}
                        />
                      )}
                    {match.result.questionnaire.mainStrategy &&
                      match.result.questionnaire.mainStrategy.length > 0 && (
                        <QuestionnaireItem
                          label="Strategy"
                          value={formatQuestionnaireArrayValues(
                            match.result.questionnaire.mainStrategy
                          )}
                        />
                      )}
                    {match.result.questionnaire.whatWorkedBest &&
                      match.result.questionnaire.whatWorkedBest.length > 0 && (
                        <QuestionnaireItem
                          label="Worked best"
                          value={formatQuestionnaireArrayValues(
                            match.result.questionnaire.whatWorkedBest
                          )}
                        />
                      )}
                    {match.result.questionnaire.whatDidntWork &&
                      match.result.questionnaire.whatDidntWork.length > 0 && (
                        <QuestionnaireItem
                          label="Didn't work"
                          value={formatQuestionnaireArrayValues(
                            match.result.questionnaire.whatDidntWork
                          )}
                        />
                      )}
                    {match.result.questionnaire.generalSensation &&
                      match.result.questionnaire.generalSensation.length > 0 && (
                        <QuestionnaireItem
                          label="General feeling"
                          value={formatQuestionnaireArrayValues(
                            match.result.questionnaire.generalSensation
                          )}
                        />
                      )}
                    {match.result.questionnaire.opponentStrength &&
                      match.result.questionnaire.opponentStrength.length > 0 && (
                        <QuestionnaireItem
                          label="Opponent's strength"
                          value={formatQuestionnaireArrayValues(
                            match.result.questionnaire.opponentStrength
                          )}
                        />
                      )}
                    {match.result.questionnaire.pointBuilding &&
                      match.result.questionnaire.pointBuilding.length > 0 && (
                        <QuestionnaireItem
                          label="Point building"
                          value={formatQuestionnaireArrayValues(
                            match.result.questionnaire.pointBuilding
                          )}
                        />
                      )}
                    {match.result.questionnaire.serveStrategy &&
                      match.result.questionnaire.serveStrategy.length > 0 && (
                        <QuestionnaireItem
                          label="Serve strategy"
                          value={formatQuestionnaireArrayValues(
                            match.result.questionnaire.serveStrategy
                          )}
                        />
                      )}
                    {match.result.questionnaire.importantPoints &&
                      match.result.questionnaire.importantPoints.length > 0 && (
                        <QuestionnaireItem
                          label="Important points"
                          value={formatQuestionnaireArrayValues(
                            match.result.questionnaire.importantPoints
                          )}
                        />
                      )}
                    {match.result.questionnaire.netApproach &&
                      match.result.questionnaire.netApproach.length > 0 && (
                        <QuestionnaireItem
                          label="Net approach"
                          value={formatQuestionnaireArrayValues(
                            match.result.questionnaire.netApproach
                          )}
                        />
                      )}
                    {match.result.questionnaire.tacticAdjustment &&
                      match.result.questionnaire.tacticAdjustment.length > 0 && (
                        <QuestionnaireItem
                          label="Tactic adjustment"
                          value={formatQuestionnaireArrayValues(
                            match.result.questionnaire.tacticAdjustment
                          )}
                        />
                      )}
                    {match.result.questionnaire.targetedSide &&
                      match.result.questionnaire.targetedSide.length > 0 && (
                        <QuestionnaireItem
                          label="Targeted side"
                          value={formatQuestionnaireArrayValues(
                            match.result.questionnaire.targetedSide
                          )}
                        />
                      )}
                    {match.result.questionnaire.mainMistake &&
                      match.result.questionnaire.mainMistake.length > 0 && (
                        <QuestionnaireItem
                          label="Main mistake"
                          value={formatQuestionnaireArrayValues(
                            match.result.questionnaire.mainMistake
                          )}
                        />
                      )}
                  </CardContent>
                </Card>
              )}
            </>
          ) : match.status === "scheduled" && !resultSubmitted ? (
            <Card className="border-border/50">
              <CardHeader>
                <CardTitle className="text-base font-semibold tracking-tight">
                  {t("matchDetails.submit.title")}
                </CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col items-center justify-center py-8">
                <p className="mb-4 text-center text-sm text-muted-foreground">
                  {t("matchDetails.submit.disabled")}
                </p>
                <Button size="lg" className="gap-2" disabled>
                  {t("matchDetails.submit.button")}
                </Button>
              </CardContent>
            </Card>
          ) : (
            <Card className="border-border/50">
              <CardContent className="py-16 text-center">
                <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
                  <CheckCircle className="h-5 w-5 text-primary" />
                </div>
                <p className="text-sm text-muted-foreground">
                  {t("matchDetails.submit.submitted")}
                </p>
              </CardContent>
            </Card>
          )}

          {/* Players Card */}
          <Card className="border-border/50">
            <CardHeader>
              <CardTitle className="text-base font-semibold tracking-tight">{t("matchDetails.players")}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {((match.participants ?? []).length >= 4
                ? (match.participants ?? []).map((p) => ({
                    id: p.userId,
                    userId: p.userId,
                    name: p.userName ?? t("common.unknown"),
                    city: "",
                    levelValue: 0,
                  }))
                : [currentPlayer, opponent]
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
                    <p className="text-xs text-muted-foreground">{player.city || "—"}</p>
                  </div>
                  <div className="text-right">
                    {player.levelValue > 0 ? (
                      <>
                        <p className="font-mono text-sm font-semibold text-foreground">
                          {player.levelValue.toFixed(1)}
                        </p>
                        <p className="text-xs text-muted-foreground">{t("common.level")}</p>
                      </>
                    ) : (
                      <p className="text-xs text-muted-foreground">—</p>
                    )}
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  )
}

function QuestionnaireItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between rounded-lg bg-muted/20 px-3 py-2">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-sm font-medium text-foreground">{value}</span>
    </div>
  )
}

function formatQuestionnaireValue(value: string): string {
  return value
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ")
}

function formatQuestionnaireArrayValues(values: string[]): string {
  return values.map(formatQuestionnaireValue).join(", ")
}
