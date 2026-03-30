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
  X,
  Plus,
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
import { MatchTypeBadge } from "@/components/match-type-badge"
import { AddReminderDialog } from "@/components/add-reminder-dialog"
import { AddToCalendarButton } from "@/components/add-to-calendar-button"
import { CancelMatchButton } from "@/components/cancel-match-button"
import { ResultUploadDialog } from "@/components/result-upload-dialog"
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
import { resultsService } from "@/lib/services/results.service"
import { aceupService, type AceUpValidation } from "@/lib/services/aceup.service"
import { Input } from "@/components/ui/input"
import type { Match, MatchResult, SetScore } from "@/lib/types"
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

  const [result, setResult] = useState<MatchResult | null>(null)
  const [confirmingResult, setConfirmingResult] = useState(false)
  const [disputeOpen, setDisputeOpen] = useState(false)
  const [disputeReason, setDisputeReason] = useState("")
  const [disputeProposedSets, setDisputeProposedSets] = useState<{ player1Score: string; player2Score: string }[]>([
    { player1Score: "", player2Score: "" },
  ])
  const [submittingDispute, setSubmittingDispute] = useState(false)
  const [resolveOpen, setResolveOpen] = useState(false)
  const [resolveSets, setResolveSets] = useState<{ player1Score: string; player2Score: string }[]>([
    { player1Score: "", player2Score: "" },
  ])
  const [submittingResolve, setSubmittingResolve] = useState(false)
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

  const [aceupValidation, setAceupValidation] = useState<AceUpValidation | null>(null)
  const [sendingToAceup, setSendingToAceup] = useState(false)

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
        if (!cancelled) {
          setMatch(m)
          // Fetch result separately if the match has one
          if (m.status === "awaiting_confirmation" || m.status === "completed" || m.status === "disputed") {
            resultsService.getByMatch(m.id).then((r) => { if (!cancelled) setResult(r as unknown as MatchResult) }).catch(() => {})
          }
        }
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

  useEffect(() => {
    if (!id || !result || !currentUserId) return
    const hostUserId = match?.hostUserId ?? match?.player1.userId
    if (hostUserId !== currentUserId) return
    if (!["submitted", "confirmed"].includes(result.status)) return
    aceupService.validate(id).then(setAceupValidation).catch(() => {})
  }, [id, result?.status, currentUserId, match?.hostUserId])

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

  async function handleConfirmResult() {
    if (!result) return
    setConfirmingResult(true)
    try {
      const updated = await resultsService.confirm(result.id)
      setResult(updated as unknown as MatchResult)
      if (updated.status === "confirmed") {
        setMatch((m) => m ? { ...m, status: "completed" } : m)
        toast.success(t("matchDetails.result.confirmSuccess"))
      } else {
        toast.success(t("matchDetails.result.confirmRecorded"))
      }
    } catch {
      toast.error(t("matchDetails.result.confirmError"))
    } finally {
      setConfirmingResult(false)
    }
  }

  async function handleDisputeResult(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!result) return
    setSubmittingDispute(true)
    try {
      const filledSets = disputeProposedSets.filter((s) => s.player1Score !== "" || s.player2Score !== "")
      const proposedSets: SetScore[] = filledSets.map((s, i) => ({
        setNumber: i + 1,
        player1Score: parseInt(s.player1Score) || 0,
        player2Score: parseInt(s.player2Score) || 0,
      }))
      const notePayload = JSON.stringify({
        reason: disputeReason,
        ...(proposedSets.length > 0 && { proposedSets }),
      })
      await resultsService.dispute(result.id, notePayload)
      setMatch((m) => m ? { ...m, status: "disputed" } : m)
      setDisputeOpen(false)
      toast.success(t("matchDetails.result.disputeSuccess"))
    } catch {
      toast.error(t("matchDetails.result.disputeError"))
    } finally {
      setSubmittingDispute(false)
    }
  }

  async function handleResolveDispute(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!result) return
    const filledSets = resolveSets.filter((s) => s.player1Score !== "" && s.player2Score !== "")
    if (filledSets.length === 0) { toast.error("Enter at least one set score"); return }
    setSubmittingResolve(true)
    try {
      const setsPayload = filledSets.map((s, i) => ({
        setNumber: i + 1,
        player1Score: parseInt(s.player1Score),
        player2Score: parseInt(s.player2Score),
      }))
      const updated = await resultsService.resolveDispute(result.id, setsPayload)
      setResult(updated as unknown as MatchResult)
      setMatch((m) => m ? { ...m, status: "awaiting_confirmation" } : m)
      setResolveOpen(false)
      setResolveSets([{ player1Score: "", player2Score: "" }])
      toast.success("Dispute resolved — result reset for confirmation")
    } catch {
      toast.error("Failed to resolve dispute")
    } finally {
      setSubmittingResolve(false)
    }
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
              <MatchTypeBadge type={match.matchType} />
              <StatusBadge
                status={
                  match.status === "scheduled" && isMatchInPast(match.date, match.time)
                    ? "awaiting_result"
                    : match.status
                }
              />
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
                    <div className="w-28 text-center">
                      <p className="break-words text-sm font-semibold text-foreground">{currentPlayer.name}</p>
                      <p className="font-mono text-xs text-muted-foreground">{t("common.level")} {currentPlayer.levelValue.toFixed(1)}</p>
                    </div>
                  </div>
                  <div className="flex shrink-0 flex-col items-center gap-1">
                    <span className="text-2xl font-bold text-muted-foreground/40">{t("common.vs")}</span>
                    {match.result && match.result.sets.length > 0 && (
                      <div className="flex items-center gap-2 mt-0.5">
                        {match.result.sets.map((s, i) => {
                          const p1Wins = s.player1Score > s.player2Score
                          return (
                            <div key={i} className="flex items-baseline gap-0.5 font-mono">
                              <span className={p1Wins ? "text-xl font-bold text-foreground" : "text-sm text-muted-foreground/60"}>
                                {s.player1Score}
                              </span>
                              <span className="text-[10px] text-muted-foreground/30 px-0.5">–</span>
                              <span className={!p1Wins ? "text-xl font-bold text-foreground" : "text-sm text-muted-foreground/60"}>
                                {s.player2Score}
                              </span>
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </div>
                  <div className="flex flex-col items-center gap-2">
                    <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-muted text-lg font-bold text-muted-foreground">
                      {opponent.name.split(" ").map((n) => n[0]).join("")}
                    </div>
                    <div className="w-28 text-center">
                      <p className="break-words text-sm font-semibold text-foreground">{opponent.name}</p>
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
                {language === "es"
                  ? format(parseISO(match.date), "d 'de' MMMM, yyyy", { locale: dateLocale })
                  : format(parseISO(match.date), "MMM d, yyyy", { locale: dateLocale })}
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
                {!match.result && (
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
                )}
                {!match.result && (
                  <CancelMatchButton
                    matchId={match.id}
                    userId={currentUserId}
                    onSuccess={(m) => setMatch(m)}
                  />
                )}
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
              {hostMemberships.length > 0 && !bookingAttempt && !isMatchInPast(match.date, match.time) && (
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
                          · {t("matchDetails.booking.ref")}{" "}
                          {/^\d+$/.test(bookingAttempt.externalBookingId) ? (
                            <a
                              href={`https://laieta.miclubonline.net/reservas/${bookingAttempt.externalBookingId}/pistas`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="underline hover:text-foreground"
                            >
                              {bookingAttempt.externalBookingId}
                            </a>
                          ) : bookingAttempt.externalBookingId}
                        </span>
                      )}
                    </div>
                  )}
                  {!isMatchInPast(match.date, match.time) && (
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
                  )}
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
                      {getBookingErrorMessage(bookingAttempt.errorCode, t, bookingAttempt.errorMessage)}
                    </span>
                  </div>
                  {!isMatchInPast(match.date, match.time) && !match.result &&
                    bookingAttempt.errorCode !== "MISSING_SOCIO_NUMBER" &&
                    bookingAttempt.errorCode !== "INVALID_CLUB_CREDENTIALS" && (
                    <p className="text-xs text-muted-foreground">{t("matchDetails.booking.autoRetryMessage")}</p>
                  )}
                  {!isMatchInPast(match.date, match.time) && (
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
                  )}
                </div>
              )}
              {bookingAttempt?.status === "cancelled" && !isMatchInPast(match.date, match.time) && (
                <div className="space-y-3">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <XCircle className="h-4 w-4 shrink-0" />
                    <span>{t("matchDetails.booking.bookingCancelled")}</span>
                  </div>
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
                    {!isMatchInPast(match.date, match.time) && (
                      <Button variant="outline" size="sm" className="gap-2" onClick={handleRetryBooking} disabled={retryingBooking}>
                        {retryingBooking ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                        {t("matchDetails.booking.retryBooking")}
                      </Button>
                    )}
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
          {result ? (
            <>
              <Card className="border-border/50">
                <CardHeader>
                  <CardTitle className="text-base font-semibold tracking-tight">
                    {t("matchDetails.result.title")}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    {/* Column headers */}
                    <div className="grid grid-cols-[3rem_1fr_2rem_1fr] items-center gap-1 px-4">
                      <span />
                      <span className="text-center text-xs font-medium text-muted-foreground truncate">
                        {match.format === 'doubles' ? t("results.dialog.teamALabel") : match.player1.name.split(" ")[0]}
                      </span>
                      <span />
                      <span className="text-center text-xs font-medium text-muted-foreground truncate">
                        {match.format === 'doubles' ? t("results.dialog.teamBLabel") : match.player2.name.split(" ")[0]}
                      </span>
                    </div>
                    {result.sets.map((set) => {
                      const p1Wins = set.player1Score > set.player2Score
                      return (
                        <div
                          key={set.setNumber}
                          className="grid grid-cols-[3rem_1fr_2rem_1fr] items-center gap-1 rounded-lg bg-muted/30 px-4 py-2.5"
                        >
                          <span className="text-xs font-medium text-muted-foreground">
                            {t("matchDetails.result.set", { number: set.setNumber })}
                          </span>
                          <span className={`text-center font-mono leading-none ${p1Wins ? "text-xl font-bold text-foreground" : "text-sm text-muted-foreground/60"}`}>
                            {set.player1Score}
                          </span>
                          <span className="text-center text-[10px] text-muted-foreground/30">–</span>
                          <span className={`text-center font-mono leading-none ${!p1Wins ? "text-xl font-bold text-foreground" : "text-sm text-muted-foreground/60"}`}>
                            {set.player2Score}
                          </span>
                        </div>
                      )
                    })}
                  </div>

                  {result.player1RatingChange !== undefined && (
                    <div className="flex items-center gap-4 rounded-lg border border-border/50 p-3">
                      <div className="flex items-center gap-2">
                        {result.player1RatingChange! > 0 ? (
                          <TrendingUp className="h-4 w-4 text-primary" />
                        ) : (
                          <TrendingDown className="h-4 w-4 text-destructive" />
                        )}
                        <span className="text-xs text-muted-foreground">{t("matchDetails.result.ratingChange")}</span>
                        <span
                          className={`font-mono text-sm font-semibold ${
                            result.player1RatingChange! > 0 ? "text-primary" : "text-destructive"
                          }`}
                        >
                          {result.player1RatingChange! > 0 ? "+" : ""}
                          {result.player1RatingChange}
                        </span>
                      </div>
                    </div>
                  )}

                  {match.matchType === "competitive" && (
                    <div className={`rounded-lg border p-3 space-y-1.5 ${
                      result.status === "confirmed"
                        ? "border-emerald-500/30 bg-emerald-500/5"
                        : result.status === "disputed"
                        ? "border-destructive/30 bg-destructive/5"
                        : "border-amber-500/30 bg-amber-500/5"
                    }`}>
                      <div className="flex items-center gap-1.5">
                        {result.status === "confirmed" ? (
                          <CheckCircle className="h-3.5 w-3.5 text-emerald-500" />
                        ) : result.status === "disputed" ? (
                          <AlertTriangle className="h-3.5 w-3.5 text-destructive" />
                        ) : (
                          <Clock className="h-3.5 w-3.5 text-amber-500" />
                        )}
                        <p className={`text-sm font-semibold ${
                          result.status === "confirmed"
                            ? "text-emerald-600 dark:text-emerald-400"
                            : result.status === "disputed"
                            ? "text-destructive"
                            : "text-amber-600 dark:text-amber-400"
                        }`}>
                          {result.status === "submitted"
                            ? t("matchDetails.result.awaitingConfirmation")
                            : result.status === "confirmed"
                            ? t("matchDetails.result.confirmed")
                            : result.status === "disputed"
                            ? t("matchDetails.result.disputed")
                            : result.status}
                        </p>
                      </div>
                      {result.status === "submitted" && (
                        <div className="space-y-0.5">
                          <p className="text-xs text-muted-foreground">{t("matchDetails.result.autoConfirmHint")}</p>
                          {result.createdAt && (() => {
                            const msRemaining = Math.max(0, new Date(result.createdAt!).getTime() + 5 * 24 * 60 * 60 * 1000 - Date.now())
                            const daysRemaining = Math.floor(msRemaining / (24 * 60 * 60 * 1000))
                            const hoursRemaining = Math.ceil((msRemaining % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000))
                            return msRemaining > 0 ? (
                              <p className="text-xs font-medium text-amber-600 dark:text-amber-400">{t("matchDetails.result.autoConfirmCountdown", { days: daysRemaining, hours: hoursRemaining })}</p>
                            ) : null
                          })()}
                        </div>
                      )}
                    </div>
                  )}

                  {result.status === "disputed" && result.disputeNote && (() => {
                    let parsed: { reason?: string; proposedSets?: { setNumber: number; player1Score: number; player2Score: number }[] } = {}
                    try { parsed = JSON.parse(result.disputeNote) } catch { parsed = { reason: result.disputeNote } }
                    if (!parsed.reason && !parsed.proposedSets?.length) return null
                    return (
                      <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 space-y-1.5">
                        <p className="text-xs font-semibold text-destructive">{t("matchDetails.result.disputeNoteTitle")}</p>
                        {parsed.reason && (
                          <p className="text-sm text-foreground">{parsed.reason}</p>
                        )}
                        {parsed.proposedSets && parsed.proposedSets.length > 0 && (
                          <p className="text-xs text-muted-foreground">
                            {t("matchDetails.result.disputeProposedScore")}:{" "}
                            <span className="font-mono font-medium">
                              {parsed.proposedSets.map((s) => `${s.player1Score}–${s.player2Score}`).join("  ")}
                            </span>
                          </p>
                        )}
                      </div>
                    )
                  })()}

                  {(() => {
                    // Show confirm/dispute only to the opposing participant or admins.
                    // The submitter already confirmed at submission time.
                    const isParticipant = currentUserId === match.player1.userId || currentUserId === match.player2.userId ||
                      (match.participants ?? []).some((p) => p.userId === currentUserId)
                    const isSubmitter = result.submittedByUserId === currentUserId
                    const canAct = isParticipant && !isSubmitter
                    if (!canAct || match.status !== "awaiting_confirmation") return null
                    return (
                      <div className="flex gap-2">
                        <Button size="sm" onClick={handleConfirmResult} disabled={confirmingResult}>
                          {confirmingResult ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <CheckCircle className="mr-1.5 h-4 w-4" />}
                          {t("matchDetails.result.confirmResult")}
                        </Button>
                        <Dialog open={disputeOpen} onOpenChange={setDisputeOpen}>
                          <DialogTrigger asChild>
                            <Button size="sm" variant="outline">
                              <AlertTriangle className="mr-1.5 h-4 w-4" />
                              {t("matchDetails.result.dispute")}
                            </Button>
                          </DialogTrigger>
                          <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-[480px]">
                            <DialogHeader>
                              <DialogTitle>{t("matchDetails.result.disputeTitle")}</DialogTitle>
                            </DialogHeader>
                            <form onSubmit={handleDisputeResult} className="space-y-5">
                              <div className="space-y-2">
                                <Label className="text-xs font-medium">{t("matchDetails.result.disputeReason")}</Label>
                                <Textarea
                                  placeholder={t("matchDetails.result.disputePlaceholder")}
                                  value={disputeReason}
                                  onChange={(e) => setDisputeReason(e.target.value)}
                                  required
                                />
                              </div>
                              <div className="space-y-2">
                                <Label className="text-xs font-medium">{t("matchDetails.result.disputeProposedScore")}</Label>
                                <p className="text-xs text-muted-foreground">{t("matchDetails.result.disputeProposedScoreHint")}</p>
                                <div className="space-y-2">
                                  {disputeProposedSets.map((set, i) => (
                                    <div key={i} className="flex items-center gap-2">
                                      <span className="w-12 text-xs text-muted-foreground">Set {i + 1}</span>
                                      <Input
                                        type="number" min={0} max={7} className="w-16"
                                        value={set.player1Score}
                                        onChange={(e) => setDisputeProposedSets((prev) => prev.map((s, j) => j === i ? { ...s, player1Score: e.target.value } : s))}
                                        placeholder={match.player1.name.split(" ")[0]}
                                      />
                                      <span className="text-muted-foreground">-</span>
                                      <Input
                                        type="number" min={0} max={7} className="w-16"
                                        value={set.player2Score}
                                        onChange={(e) => setDisputeProposedSets((prev) => prev.map((s, j) => j === i ? { ...s, player2Score: e.target.value } : s))}
                                        placeholder={match.player2.name.split(" ")[0]}
                                      />
                                      {disputeProposedSets.length > 1 && (
                                        <Button type="button" size="icon" variant="ghost" onClick={() => setDisputeProposedSets((prev) => prev.filter((_, j) => j !== i))}>
                                          <X className="h-4 w-4" />
                                        </Button>
                                      )}
                                    </div>
                                  ))}
                                  {disputeProposedSets.length < 5 && (
                                    <Button type="button" size="sm" variant="outline" onClick={() => setDisputeProposedSets((prev) => [...prev, { player1Score: "", player2Score: "" }])}>
                                      <Plus className="mr-1.5 h-4 w-4" /> Add set
                                    </Button>
                                  )}
                                </div>
                              </div>
                              <Button type="submit" variant="destructive" className="w-full" disabled={submittingDispute}>
                                {submittingDispute ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : null}
                                {t("matchDetails.result.submitDispute")}
                              </Button>
                            </form>
                          </DialogContent>
                        </Dialog>
                      </div>
                    )
                  })()}

                  {/* Send to AceUp — host only, when both players are on AceUp */}
                  {isHost && aceupValidation?.valid && (
                    <div className="mt-3 pt-3 border-t border-border/50">
                      {(result.aceupSyncedAt || result.aceupChallengeId) ? (
                        <div className="flex flex-col gap-1.5">
                          <Button size="sm" variant="outline" className="w-full" disabled>
                            <CheckCircle className="mr-1.5 h-4 w-4 text-green-500" />
                            {t("matchDetails.aceup.sentToAceUp")}
                          </Button>
                          {result.aceupChallengeId && (
                            <a
                              href={`https://aceup.club/challenges/${result.aceupChallengeId}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-xs text-center text-muted-foreground hover:text-foreground underline underline-offset-2"
                            >
                              {t("matchDetails.aceup.viewOnAceUp")}
                            </a>
                          )}
                        </div>
                      ) : (
                        <Button
                          size="sm"
                          variant="outline"
                          className="w-full"
                          disabled={sendingToAceup}
                          onClick={async () => {
                            setSendingToAceup(true)
                            try {
                              const response = await aceupService.send(id!)
                              setResult((prev) => prev ? { ...prev, aceupSyncedAt: new Date().toISOString(), aceupChallengeId: response.challengeId } : prev)
                              toast.success(t("matchDetails.aceup.sendSuccess"))
                            } catch {
                              toast.error(t("matchDetails.aceup.sendFailed"))
                            } finally {
                              setSendingToAceup(false)
                            }
                          }}
                        >
                          {sendingToAceup
                            ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                            : null}
                          {t("matchDetails.aceup.sendToAceUp")}
                        </Button>
                      )}
                    </div>
                  )}

                  {/* Admin: resolve disputed result */}
                  {isAdmin && match.status === "disputed" && result && (
                    <div className="mt-3 pt-3 border-t border-border/50">
                      <Dialog open={resolveOpen} onOpenChange={setResolveOpen}>
                        <DialogTrigger asChild>
                          <Button size="sm" variant="outline" className="w-full">
                            Resolve dispute (admin)
                          </Button>
                        </DialogTrigger>
                        <DialogContent>
                          <DialogHeader>
                            <DialogTitle>Resolve dispute</DialogTitle>
                          </DialogHeader>
                          <form onSubmit={handleResolveDispute} className="space-y-5">
                            <p className="text-sm text-muted-foreground">
                              Enter the correct set scores. The result will be reset to <em>awaiting confirmation</em> so both players can confirm.
                            </p>
                            <div className="space-y-2">
                              <Label className="text-xs font-medium">Corrected scores</Label>
                              {resolveSets.map((set, i) => (
                                <div key={i} className="flex items-center gap-2">
                                  <span className="text-xs text-muted-foreground w-10">Set {i + 1}</span>
                                  <Input type="number" min={0} max={7} className="w-16"
                                    value={set.player1Score}
                                    onChange={(e) => setResolveSets((prev) => prev.map((s, j) => j === i ? { ...s, player1Score: e.target.value } : s))}
                                    placeholder={match.player1.name.split(" ")[0]}
                                  />
                                  <span className="text-muted-foreground">–</span>
                                  <Input type="number" min={0} max={7} className="w-16"
                                    value={set.player2Score}
                                    onChange={(e) => setResolveSets((prev) => prev.map((s, j) => j === i ? { ...s, player2Score: e.target.value } : s))}
                                    placeholder={match.player2.name.split(" ")[0]}
                                  />
                                  {resolveSets.length > 1 && (
                                    <Button type="button" size="icon" variant="ghost" onClick={() => setResolveSets((prev) => prev.filter((_, j) => j !== i))}>
                                      <X className="h-4 w-4" />
                                    </Button>
                                  )}
                                </div>
                              ))}
                              {resolveSets.length < 5 && (
                                <Button type="button" size="sm" variant="outline" onClick={() => setResolveSets((prev) => [...prev, { player1Score: "", player2Score: "" }])}>
                                  <Plus className="mr-1.5 h-4 w-4" /> Add set
                                </Button>
                              )}
                            </div>
                            <Button type="submit" className="w-full" disabled={submittingResolve}>
                              {submittingResolve ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : null}
                              Confirm corrected result
                            </Button>
                          </form>
                        </DialogContent>
                      </Dialog>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Show Questionnaire Answers if available */}
              {result?.questionnaire && Object.keys(result?.questionnaire).length > 0 && (
                <Card className="border-border/50">
                  <CardHeader>
                    <CardTitle className="text-base font-semibold tracking-tight">
                      Match Insights
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {Object.entries(result?.questionnaire ?? {}).map(([key, values]) =>
                      Array.isArray(values) && values.length > 0 ? (
                        <QuestionnaireItem
                          key={key}
                          label={t(`results.questionnaire.${key}.label`)}
                          value={formatQuestionnaireArrayValues(values as string[])}
                        />
                      ) : null
                    )}
                  </CardContent>
                </Card>
              )}
            </>
          ) : match.status === "scheduled" || match.status === "awaiting_confirmation" ? (
            <Card className="border-border/50">
              <CardHeader>
                <CardTitle className="text-base font-semibold tracking-tight">
                  {t("matchDetails.submit.title")}
                </CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col items-center justify-center py-8">
                <ResultUploadDialog
                  match={match}
                  onResultSubmitted={() => {
                    setMatch((m) => m ? { ...m, status: "awaiting_confirmation" } : m)
                    resultsService.getByMatch(match.id).then((r) => setResult(r as unknown as MatchResult)).catch(() => {})
                  }}
                  trigger={
                    <Button size="lg" className="gap-2">
                      {t("matchDetails.submit.button")}
                    </Button>
                  }
                />
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
