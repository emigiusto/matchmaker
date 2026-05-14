import { useState, useEffect } from "react"
import { format, parseISO } from "date-fns"
import { es as esLocale } from "date-fns/locale"
import { Link } from "react-router-dom"
import {
  Calendar,
  Clock,
  MapPin,
  Zap,
  Trash2,
  CheckCircle,
  XCircle,
  CirclePlay,
  Loader2,
  UserCheck,
  UserX,
  ShieldCheck,
  Hourglass,
  PhoneOff,
  RotateCcw,
  ExternalLink,
  History,
  ChevronDown,
  ChevronUp,
  Building2,
  Ban,
} from "lucide-react"
import type { SchedulingInviteEventDTO, AdditionalDateEntry } from "@/lib/services/scheduling.service"
import { SportFormatBadge } from "@/components/sport-format-badge"
import { MatchTypeBadge } from "@/components/match-type-badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { IWantToPlayWizard } from "@/components/i-want-to-play-wizard"
import { AddContactsToInvite } from "@/components/add-contacts-to-invite"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { toast } from "sonner"
import { schedulingService } from "@/lib/services/scheduling.service"
import { matchesService } from "@/lib/services/matches.service"
import { PageHeader } from "@/components/page-header"
import { useTranslation } from "@/lib/i18n"

export interface InviteRequest {
  id: string
  inviteToken: string
  date: string
  time: string
  startTime: string
  location: string
  matchType: "competitive" | "practice"
  sport: "tennis" | "padel"
  matchFormat: "singles" | "doubles"
  status: "scheduling" | "matched" | "expired" | "cancelled"
  matchId: string | null
  whatsappGroupId: string | null
  noCourtsAtQuorum: boolean
  additionalDates: AdditionalDateEntry[] | null
  contacts: {
    id: string
    contactUserId: string
    name: string
    phone: string | null
    status: "pending" | "contacted" | "declined" | "accepted" | "no_response" | "cancelled" | "send_failed"
    contactedAt: string | null
  }[]
  currentIndex: number
}

const MAX_ACTIVE_REQUESTS = 5
const SCHEDULING_POLL_INTERVAL_MS = 5000


function formatTimeRange(startIso: string, endIso: string): string {
  try {
    const start = new Date(startIso)
    const end = new Date(endIso)
    return `${format(start, "HH:mm")} - ${format(end, "HH:mm")}`
  } catch {
    return ""
  }
}

function mapSchedulingToInviteRequest(
  r: import("@/lib/services/scheduling.service").SchedulingRequestDTO,
  t: (key: string) => string = (key) => key
): InviteRequest | null {
  const statusMap = {
    active: "scheduling" as const,
    completed: "matched" as const,
    expired: "expired" as const,
    cancelled: "cancelled" as const,
  }
  const contactStatusMap = {
    pending: "pending" as const,
    contacted: "contacted" as const,
    waiting_reply: "contacted" as const,
    accepted: "accepted" as const,
    declined: "declined" as const,
    expired: "no_response" as const,
    cancelled: "cancelled" as const,
    send_failed: "send_failed" as const,
  }
  const dateStr = r.date.slice(0, 10)
  const timeStr = formatTimeRange(r.startTime, r.endTime)
  const candidates = r.candidates ?? []
  const contacts = candidates.map((c) => ({
    id: c.id,
    contactUserId: c.contactUserId,
    name: c.contactUserName ?? t("common.unknown"),
    phone: c.contactPhone ?? null,
    status: contactStatusMap[c.status] ?? "pending",
    contactedAt: c.contactedAt ?? null,
  }))
  return {
    id: r.id,
    inviteToken: r.inviteToken,
    date: dateStr,
    time: timeStr,
    startTime: r.startTime,
    location: r.locationText,
    matchType: r.matchType,
    sport: r.sportType,
    matchFormat: r.format,
    status: statusMap[r.status] ?? "scheduling",
    matchId: r.matchId ?? null,
    whatsappGroupId: r.whatsappGroupId ?? null,
    noCourtsAtQuorum: r.noCourtsAtQuorum ?? false,
    additionalDates: r.additionalDates ?? null,
    contacts,
    currentIndex: r.currentCandidateIndex,
  }
}

export interface InviteRequestsSectionProps {
  currentUserId: string
  wizardOpen: boolean
  setWizardOpen: (open: boolean) => void
  /** Optional: render custom header (e.g. I Want to Play button) */
  headerAction?: React.ReactNode
  /** When "standalone", renders PageHeader + padded content. Use for full pages like /play */
  variant?: "standalone" | "embedded"
  /** When false, wizard is rendered by parent (e.g. Dashboard). Use when wizard must stay mounted across tab switches. */
  renderWizard?: boolean
  /** Increment to trigger a refetch of invites (e.g. after wizard completes in parent) */
  refreshTrigger?: number
  pageTitle?: string
  pageDescription?: string
}

export function InviteRequestsSection({
  currentUserId,
  wizardOpen,
  setWizardOpen,
  headerAction,
  variant = "embedded",
  renderWizard = true,
  refreshTrigger,
  pageTitle = "Invites",
  pageDescription,
}: InviteRequestsSectionProps) {
  const { t, language } = useTranslation()
  const dateLocale = language === "es" ? esLocale : undefined
  const [inviteRequests, setInviteRequests] = useState<InviteRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [acceptConfirm, setAcceptConfirm] = useState<{
    requestId: string
    candidateId: string
    contactName: string
  } | null>(null)
  const [cancelConfirm, setCancelConfirm] = useState<string | null>(null)
  type InviteFilter = "active" | "expired" | "past" | "confirmed" | "cancelled"
  const [inviteFilter, setInviteFilter] = useState<InviteFilter>("active")
  const [expandedHistoryId, setExpandedHistoryId] = useState<string | null>(null)
  const [historyMap, setHistoryMap] = useState<Record<string, SchedulingInviteEventDTO[]>>({})
  const [historyLoadingId, setHistoryLoadingId] = useState<string | null>(null)
  const [groupLinkLoadingId, setGroupLinkLoadingId] = useState<string | null>(null)

  async function fetchSchedulingData(isInitial = false) {
    if (isInitial) setLoading(true)
    try {
      const requestsRes = await schedulingService.listByHost(currentUserId)
      const mapped = requestsRes
        .map((r) => mapSchedulingToInviteRequest(r, t))
        .filter((r): r is InviteRequest => r !== null)
      setInviteRequests(mapped)
      // Refresh history for any card that has already been expanded
      setHistoryMap((prev) => {
        const loadedIds = Object.keys(prev)
        if (loadedIds.length === 0) return prev
        loadedIds.forEach((id) => {
          schedulingService.getEvents(id).then((events) => {
            setHistoryMap((m) => ({ ...m, [id]: events }))
          }).catch(() => {})
        })
        return prev
      })
      return mapped
    } catch {
      setInviteRequests([])
      return []
    } finally {
      if (isInitial) setLoading(false)
    }
  }

  useEffect(() => {
    fetchSchedulingData(true).catch(() => {})
  }, [currentUserId])

  useEffect(() => {
    if (refreshTrigger != null && refreshTrigger > 0) {
      fetchSchedulingData(false).catch(() => {})
    }
  }, [refreshTrigger])

  useEffect(() => {
    const hasActive = inviteRequests.some((r) => r.status === "scheduling")
    if (!hasActive) return
    const interval = setInterval(() => {
      fetchSchedulingData(false)
    }, SCHEDULING_POLL_INTERVAL_MS)
    return () => clearInterval(interval)
  }, [inviteRequests, currentUserId])

  async function handleOpenWhatsappGroup(matchId: string, requestId: string) {
    setGroupLinkLoadingId(requestId)
    try {
      const link = await matchesService.getWhatsappGroupLink(matchId)
      window.open(link, "_blank", "noopener,noreferrer")
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("errors.generic"))
    } finally {
      setGroupLinkLoadingId(null)
    }
  }

  const getDisplayStatus = (r: InviteRequest) => {
    const hasActiveContact = r.contacts.some((c) => c.status === "contacted")
    if (r.status === "expired" && hasActiveContact) return "scheduling"
    if (r.status === "scheduling" && r.contacts.length > 0) {
      const hasInProgress = r.contacts.some((c) => c.status === "pending" || c.status === "contacted")
      if (!hasInProgress) return "expired"
    }
    return r.status
  }

  const isInThePast = (r: InviteRequest) => {
    const dt = new Date(r.startTime)
    return !isNaN(dt.getTime()) && dt < new Date()
  }

  const filteredRequests = inviteRequests
    .filter((r) => {
      const displayStatus = getDisplayStatus(r)
      const past = isInThePast(r)
      if (inviteFilter === "active") return displayStatus === "scheduling"
      if (inviteFilter === "expired") return !past && displayStatus === "expired"
      if (inviteFilter === "past") return past && displayStatus === "expired"
      if (inviteFilter === "confirmed") return displayStatus === "matched"
      if (inviteFilter === "cancelled") return displayStatus === "cancelled"
      return true
    })
    .sort((a, b) => {
      if (inviteFilter !== "active") return 0
      const rank = (r: InviteRequest) => (getDisplayStatus(r) === "scheduling" ? 0 : 1)
      return rank(a) - rank(b)
    })

  function switchToFilterForStatus(status: InviteRequest["status"], request?: InviteRequest, forceSwitch = false) {
    if (inviteFilter === "active" && !forceSwitch) return
    if (status === "scheduling") {
      setInviteFilter("active")
    } else if (status === "expired") {
      setInviteFilter(request && isInThePast(request) ? "past" : "expired")
    } else if (status === "cancelled") setInviteFilter("cancelled")
    else if (status === "matched") setInviteFilter("confirmed")
  }

  const activeRequestCount = inviteRequests.filter(
    (r) => r.status === "scheduling"
  ).length
  const atCapacity = activeRequestCount >= MAX_ACTIVE_REQUESTS

  async function handleCancelRequest(id: string) {
    setCancelConfirm(null)
    try {
      const updated = await schedulingService.cancel(id, currentUserId)
      const mapped = mapSchedulingToInviteRequest(updated, t)
      if (mapped) {
        setInviteRequests((prev) => prev.map((r) => (r.id === id ? mapped : r)))
        switchToFilterForStatus(mapped.status, mapped, true)
      }
      toast.success(t("invites.toast.requestCancelled"))
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("invites.toast.cancelRequestFailed"))
    }
  }

  async function handleCancelContact(requestId: string, candidateId: string) {
    try {
      const updated = await schedulingService.cancelContacted(requestId, candidateId, currentUserId)
      const mapped = mapSchedulingToInviteRequest(updated, t)
      if (mapped) {
        setInviteRequests((prev) => prev.map((r) => (r.id === requestId ? mapped : r)))
        switchToFilterForStatus(mapped.status, mapped)
        toast.success(t("invites.toast.inviteCancelled"))
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("invites.toast.cancelFailed"))
    }
  }

  async function handleRemoveContact(requestId: string, candidateId: string) {
    try {
      const updated = await schedulingService.removeCandidate(requestId, candidateId, currentUserId)
      const mapped = mapSchedulingToInviteRequest(updated, t)
      if (mapped) {
        setInviteRequests((prev) => prev.map((r) => (r.id === requestId ? mapped : r)))
        switchToFilterForStatus(mapped.status, mapped)
        toast.success(t("invites.toast.removedFromQueue"))
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("invites.toast.removeFailed"))
    }
  }

  async function handleCancelAccepted(requestId: string, candidateId: string) {
    try {
      const updated = await schedulingService.cancelAccepted(requestId, candidateId, currentUserId)
      const mapped = mapSchedulingToInviteRequest(updated, t)
      if (mapped) {
        setInviteRequests((prev) => prev.map((r) => (r.id === requestId ? mapped : r)))
        switchToFilterForStatus(mapped.status, mapped)
        toast.success(t("invites.toast.acceptanceCancelled"))
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("invites.toast.cancelFailed"))
    }
  }

  async function handleManualAccept(requestId: string, candidateId: string) {
    try {
      const updated = await schedulingService.manualAccept(requestId, candidateId, currentUserId)
      const mapped = mapSchedulingToInviteRequest(updated, t)
      if (mapped) {
        setInviteRequests((prev) => prev.map((r) => (r.id === requestId ? mapped : r)))
        switchToFilterForStatus(mapped.status, mapped)
        toast.success(t("invites.toast.matchConfirmed"))
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("invites.toast.acceptFailed"))
    } finally {
      setAcceptConfirm(null)
    }
  }

  async function handleRetryContact(requestId: string, candidateId: string) {
    // Optimistically move candidate to "contacted" (scheduling) before the API call
    setInviteRequests((prev) =>
      prev.map((r) =>
        r.id !== requestId
          ? r
          : { ...r, contacts: r.contacts.map((c) => c.id === candidateId ? { ...c, status: "contacted" as const } : c) }
      )
    )
    try {
      const updated = await schedulingService.retry(requestId, candidateId, currentUserId)
      const mapped = mapSchedulingToInviteRequest(updated, t)
      if (mapped) {
        setInviteRequests((prev) => prev.map((r) => (r.id === requestId ? mapped : r)))
        switchToFilterForStatus(mapped.status, mapped)
        toast.success(t("invites.toast.retryQueued"))
      }
    } catch (e) {
      // Revert to send_failed so the user can retry again
      setInviteRequests((prev) =>
        prev.map((r) =>
          r.id !== requestId
            ? r
            : { ...r, contacts: r.contacts.map((c) => c.id === candidateId ? { ...c, status: "send_failed" as const } : c) }
        )
      )
      toast.error(e instanceof Error ? e.message : t("invites.toast.retryFailed"))
    }
  }


  function getEventLabel(event: SchedulingInviteEventDTO): string {
    const name = event.candidateUserName ?? t("common.unknown")
    switch (event.action) {
      case "invite_sent": return t("invites.events.inviteSent", { name })
      case "invite_accepted": return t("invites.events.inviteAccepted", { name })
      case "invite_manually_accepted": return t("invites.events.inviteManuallyAccepted", { name })
      case "invite_declined": return t("invites.events.inviteDeclined", { name })
      case "invite_expired": return t("invites.events.inviteExpired", { name })
      case "candidate_cancelled":
        return event.actorUserId === currentUserId
          ? t("invites.events.candidateCancelledByHost", { name })
          : t("invites.events.candidateCancelled", { name })
      case "candidate_retried": return t("invites.events.candidateRetried", { name })
      case "candidates_added": {
        const count = (event.metadata?.count as number) ?? 1
        return t("invites.events.candidatesAdded", { count })
      }
      case "request_started": return t("invites.events.schedulingStarted")
      case "request_cancelled": return t("invites.events.requestCancelled")
      case "request_completed": return t("invites.events.matchConfirmed")
      case "request_expired": return t("invites.events.noMatchFound")
      case "booking_pending": return t("invites.events.bookingInProgress")
      case "booking_success": return t("invites.events.bookingSuccess", { court: event.metadata?.courtName ? `: ${event.metadata.courtName}` : "" })
      case "booking_failed": return t("invites.events.bookingFailed", { error: event.metadata?.errorMessage ? `: ${event.metadata.errorMessage}` : "" })
      case "booking_cancelled": return t("invites.events.bookingCancelled")
      case "poll_vote": return t("invites.events.pollVote", { name })
      case "no_courts_at_quorum": return t("invites.events.noCourtsAtQuorum")
      case "invite_link_accepted": return t("invites.events.inviteLinkAccepted", { name: event.metadata?.userName as string ?? name })
      default: return event.action
    }
  }

  function getEventIcon(action: SchedulingInviteEventDTO["action"]) {
    switch (action) {
      case "invite_sent": return <Loader2 className="h-3 w-3 text-blue-500" />
      case "invite_accepted": return <UserCheck className="h-3 w-3 text-green-600" />
      case "invite_manually_accepted": return <ShieldCheck className="h-3 w-3 text-green-600" />
      case "invite_declined": return <UserX className="h-3 w-3 text-red-500" />
      case "invite_expired": return <Hourglass className="h-3 w-3 text-muted-foreground" />
      case "candidate_cancelled": return <XCircle className="h-3 w-3 text-amber-500" />
      case "candidate_retried": return <RotateCcw className="h-3 w-3 text-muted-foreground" />
      case "candidates_added": return <UserCheck className="h-3 w-3 text-muted-foreground" />
      case "request_started": return <CirclePlay className="h-3 w-3 text-blue-500" />
      case "request_cancelled": return <XCircle className="h-3 w-3 text-muted-foreground" />
      case "request_completed": return <CheckCircle className="h-3 w-3 text-green-600" />
      case "request_expired": return <XCircle className="h-3 w-3 text-muted-foreground" />
      case "booking_pending": return <Building2 className="h-3 w-3 text-amber-500" />
      case "booking_success": return <Building2 className="h-3 w-3 text-green-600" />
      case "booking_failed": return <Building2 className="h-3 w-3 text-destructive" />
      case "booking_cancelled": return <Ban className="h-3 w-3 text-muted-foreground" />
      case "poll_vote": return <Clock className="h-3 w-3 text-blue-500" />
      case "no_courts_at_quorum": return <Building2 className="h-3 w-3 text-amber-500" />
      case "invite_link_accepted": return <UserCheck className="h-3 w-3 text-green-600" />
      default: return <Clock className="h-3 w-3 text-muted-foreground" />
    }
  }

  async function toggleHistory(requestId: string) {
    if (expandedHistoryId === requestId) {
      setExpandedHistoryId(null)
      return
    }
    setExpandedHistoryId(requestId)
    setHistoryLoadingId(requestId)
    try {
      const events = await schedulingService.getEvents(requestId)
      setHistoryMap((prev) => ({ ...prev, [requestId]: events }))
    } catch {
      setHistoryMap((prev) => ({ ...prev, [requestId]: [] }))
    } finally {
      setHistoryLoadingId(null)
    }
  }

  const content = (
    <div className="flex flex-col gap-4">
      {headerAction && variant === "embedded" && (
        <div className="flex items-center justify-end">{headerAction}</div>
      )}
      <div className="flex flex-wrap items-center gap-2">
          {(["active", "expired", "past", "confirmed", "cancelled"] as const).map((f) => (
            <Button
              key={f}
              variant={inviteFilter === f ? "default" : "outline"}
              size="sm"
              onClick={() => setInviteFilter(f)}
            >
              {t(`invites.filter.${f}`)}
            </Button>
          ))}
        </div>

        {loading ? (
          <Card>
            <CardContent className="flex items-center justify-center py-20">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </CardContent>
          </Card>
        ) : (
          <>
            {atCapacity && (
              <div className="mb-4 flex items-center gap-2 rounded-xl bg-destructive/10 px-4 py-2.5 text-sm text-destructive">
                <XCircle className="h-4 w-4 shrink-0" />
                {t("invites.atCapacityBanner", { max: MAX_ACTIVE_REQUESTS })}
              </div>
            )}
            {filteredRequests.length === 0 ? (
              <Card>
                <CardContent className="flex flex-col items-center justify-center py-20">
                  <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-muted">
                    <CirclePlay className="h-8 w-8 text-muted-foreground" />
                  </div>
                  <p className="mt-4 text-lg font-medium text-foreground">
                    {inviteRequests.length === 0
                      ? t("invites.empty.noInvitesYet")
                      : inviteFilter === "active"
                        ? t("invites.empty.noActiveInvites")
                        : inviteFilter === "expired"
                          ? t("invites.empty.noExpiredInvites")
                          : inviteFilter === "past"
                            ? t("invites.empty.noPastInvites")
                            : inviteFilter === "cancelled"
                              ? t("invites.empty.noCancelledInvites")
                              : t("invites.empty.noConfirmedMatches")}
                  </p>
                  <p className="mt-1 text-base text-muted-foreground">
                    {inviteRequests.length === 0
                      ? t("invites.empty.tapToCreate")
                      : t("invites.empty.tryAnotherFilter")}
                  </p>
                  <Button size="lg" className="mt-6 gap-2" onClick={() => setWizardOpen(true)}>
                    <Zap className="h-5 w-5" />
                    {t("common.iWantToPlay")}
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-4">
                {filteredRequests.map((request) => {
                  const displayStatus = getDisplayStatus(request)
                  return (
                  <Card key={request.id}>
                    <CardContent className="p-5">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <SportFormatBadge
                            sport={request.sport}
                            format={request.matchFormat}
                          />
                          <MatchTypeBadge type={request.matchType} className="text-xs" />
                          {displayStatus === "scheduling" && (
                            <span className="inline-flex items-center gap-1.5 rounded-md border border-blue-200/60 bg-blue-500/8 px-2.5 py-1 text-xs font-medium text-blue-700 dark:border-blue-800/40 dark:bg-blue-500/10 dark:text-blue-400">
                              <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" />
                              {t("invites.status.scheduling")}
                            </span>
                          )}
                          {displayStatus === "matched" && (
                            <span className="inline-flex items-center gap-1.5 rounded-md border border-green-200/60 bg-green-500/8 px-2.5 py-1 text-xs font-medium text-green-700 dark:border-green-800/40 dark:bg-green-500/10 dark:text-green-400">
                              <CheckCircle className="h-3.5 w-3.5 shrink-0" />
                              {t("invites.status.matched")}
                            </span>
                          )}
                          {request.status === "expired" && (
                            <span className="inline-flex items-center gap-1.5 rounded-md border border-border bg-muted/60 px-2.5 py-1 text-xs font-medium text-muted-foreground">
                              <XCircle className="h-3.5 w-3.5 shrink-0" />
                              {t("invites.status.expired")}
                            </span>
                          )}
                          {displayStatus === "cancelled" && (
                            <span className="inline-flex items-center gap-1.5 rounded-md border border-destructive/30 bg-destructive/10 px-2.5 py-1 text-xs font-medium text-destructive">
                              <XCircle className="h-3.5 w-3.5 shrink-0" />
                              {t("invites.status.cancelled")}
                            </span>
                          )}
                        </div>
                        <Link
                          to={`/play/${request.id}`}
                          className="shrink-0 text-muted-foreground hover:text-foreground transition-colors"
                        >
                          <ExternalLink className="h-3.5 w-3.5" />
                        </Link>
                      </div>

                      <div className="mt-3 flex flex-wrap items-center gap-4 text-sm text-foreground">
                        <span className="flex items-start gap-2">
                          <Calendar className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                          {request.additionalDates && request.additionalDates.length > 0 ? (
                            <span className="space-y-0.5">
                              {[{ date: request.date, startTime: null as string | null, endTime: null as string | null }, ...request.additionalDates].map((entry) => (
                                <span key={entry.date} className="flex items-center gap-1.5">
                                  <span className="font-medium">
                                    {language === "es"
                                      ? format(parseISO(entry.date), "EEE d/M", { locale: dateLocale })
                                      : format(parseISO(entry.date), "EEE d/M", { locale: dateLocale })}
                                  </span>
                                  <span className="text-muted-foreground">·</span>
                                  <span>{entry.startTime ? `${entry.startTime}–${entry.endTime}` : request.time}</span>
                                </span>
                              ))}
                            </span>
                          ) : (
                            <span>
                              {language === "es"
                                ? format(parseISO(request.date), "EEEE d 'de' MMMM", { locale: dateLocale })
                                : format(parseISO(request.date), "EEE, MMM d", { locale: dateLocale })}
                              {" · "}{request.time}
                            </span>
                          )}
                        </span>
                        <span className="flex items-center gap-2">
                          <MapPin className="h-4 w-4 text-primary" />
                          {request.location?.trim() || t("common.tbd")}
                        </span>
                      </div>

                      {request.noCourtsAtQuorum && request.status === "scheduling" && (
                        <div className="mt-3 flex items-start gap-2 rounded-lg border border-amber-200/60 bg-amber-500/8 px-3 py-2.5 text-xs text-amber-700 dark:border-amber-800/40 dark:bg-amber-500/10 dark:text-amber-400">
                          <Building2 className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                          <span>{t("invites.noCourtsAtQuorum")}</span>
                        </div>
                      )}

                      <div className="mt-4 border-t border-border/30 pt-4">
                        <p className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                          {t("inviteDetails.progress")}
                        </p>
                        <div className="max-h-48 space-y-1.5 overflow-y-auto pr-2">
                          {request.contacts.map((contact, idx) => (
                            <div
                              key={contact.id}
                              className={`flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs font-medium ${
                                contact.status === "accepted"
                                  ? "bg-green-500/10"
                                  : contact.status === "declined"
                                    ? "bg-red-500/10"
                                    : contact.status === "cancelled"
                                      ? "bg-amber-500/10"
                                      : contact.status === "no_response"
                                        ? "bg-muted/60"
                                        : contact.status === "send_failed"
                                          ? "bg-orange-500/10"
                                          : contact.status === "contacted"
                                          ? "bg-blue-500/10"
                                          : "bg-muted/30"
                              }`}
                            >
                              <span className="flex h-4 w-4 shrink-0 items-center justify-center">
                                {contact.status === "accepted" && (
                                  <UserCheck className="h-3.5 w-3.5 text-green-600" />
                                )}
                                {contact.status === "declined" && (
                                  <UserX className="h-3.5 w-3.5 text-red-500" />
                                )}
                                {contact.status === "cancelled" && (
                                  <XCircle className="h-3.5 w-3.5 text-amber-600" />
                                )}
                                {contact.status === "no_response" && (
                                  <Hourglass className="h-3.5 w-3.5 text-muted-foreground" />
                                )}
                                {contact.status === "send_failed" && (
                                  <PhoneOff className="h-3.5 w-3.5 text-orange-500" />
                                )}
                                {contact.status === "contacted" && displayStatus === "scheduling" && (
                                  <Loader2
                                    className="h-3.5 w-3.5 text-blue-600 animate-spin"
                                  />
                                )}
                                {contact.status === "contacted" && displayStatus !== "scheduling" && (
                                  <Hourglass className="h-3.5 w-3.5 text-muted-foreground" />
                                )}
                                {contact.status === "pending" && (
                                  <span className="text-[10px] font-bold text-muted-foreground">
                                    {idx + 1}
                                  </span>
                                )}
                              </span>
                              <span
                                className={`flex-1 ${contact.status === "declined" || contact.status === "no_response" || contact.status === "cancelled" || contact.status === "send_failed" ? "text-muted-foreground line-through" : "text-foreground"}`}
                              >
                                {contact.name}
                                {contact.phone && (
                                  <span className="ml-2 text-xs text-muted-foreground font-normal">
                                    {contact.phone}
                                  </span>
                                )}
                              </span>
                              {request.status !== "matched" &&
                                request.status !== "cancelled" &&
                                (contact.status === "pending" ||
                                  contact.status === "contacted" ||
                                  contact.status === "no_response" ||
                                  contact.status === "cancelled") && (
                                  <button
                                    onClick={() =>
                                      setAcceptConfirm({
                                        requestId: request.id,
                                        candidateId: contact.id,
                                        contactName: contact.name,
                                      })
                                    }
                                    title={t("invites.actions.accept")}
                                    className="rounded p-1 text-green-600 transition-colors hover:bg-green-500/10 hover:text-green-700"
                                  >
                                    <UserCheck className="h-3 w-3" />
                                  </button>
                                )}
                              {request.status !== "matched" &&
                                request.status !== "cancelled" &&
                                contact.status === "pending" && (
                                  <button
                                    onClick={() => handleRemoveContact(request.id, contact.id)}
                                    title={t("invites.actions.removeFromQueue")}
                                    className="rounded p-1 text-muted-foreground transition-colors hover:bg-background hover:text-destructive"
                                  >
                                    <Trash2 className="h-3 w-3" />
                                  </button>
                                )}
                              {request.status !== "matched" &&
                                request.status !== "cancelled" &&
                                (contact.status === "no_response" || contact.status === "cancelled" || contact.status === "send_failed") && (
                                  <button
                                    onClick={() => handleRetryContact(request.id, contact.id)}
                                    title={t("invites.actions.retryInvite")}
                                    className="rounded p-1 text-muted-foreground transition-colors hover:bg-background hover:text-foreground"
                                  >
                                    <RotateCcw className="h-3 w-3" />
                                  </button>
                                )}
                              {request.status !== "matched" &&
                                request.status !== "cancelled" &&
                                contact.status === "contacted" && (
                                  <button
                                    onClick={() => handleCancelContact(request.id, contact.id)}
                                    title={t("invites.actions.cancel")}
                                    className="rounded p-1 text-muted-foreground transition-colors hover:bg-background hover:text-foreground"
                                  >
                                    <XCircle className="h-3 w-3" />
                                  </button>
                                )}
                              {(request.status === "scheduling" || request.status === "expired") &&
                                contact.status === "accepted" && (
                                  <button
                                    onClick={() =>
                                      handleCancelAccepted(request.id, contact.id)
                                    }
                                    title={t("invites.actions.cancelAcceptance")}
                                    className="rounded p-1 text-muted-foreground transition-colors hover:bg-background hover:text-destructive"
                                  >
                                    <XCircle className="h-3 w-3" />
                                  </button>
                                )}
                            </div>
                          ))}
                        </div>
                      </div>

                      <div className="mt-3 border-t border-border/20 pt-3">
                        <button
                          className="flex w-full items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
                          onClick={() => toggleHistory(request.id)}
                        >
                          <History className="h-3.5 w-3.5 shrink-0" />
                          <span className="font-medium">{t("inviteDetails.history")}</span>
                          {expandedHistoryId === request.id ? (
                            <ChevronUp className="ml-auto h-3.5 w-3.5" />
                          ) : (
                            <ChevronDown className="ml-auto h-3.5 w-3.5" />
                          )}
                        </button>
                        {expandedHistoryId === request.id && (
                          <div
                            className="mt-2 max-h-48 space-y-1 overflow-y-auto pr-1"
                            ref={(el) => { if (el) el.scrollTop = el.scrollHeight }}
                          >
                            {historyLoadingId === request.id ? (
                              <div className="flex items-center justify-center py-3">
                                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                              </div>
                            ) : (historyMap[request.id] ?? []).length === 0 ? (
                              <p className="py-2 text-center text-xs text-muted-foreground">No events recorded yet</p>
                            ) : (
                              (historyMap[request.id] ?? []).map((event) => (
                                <div key={event.id} className="flex items-start gap-2 rounded px-1 py-1 text-xs">
                                  <span className="mt-0.5 shrink-0">{getEventIcon(event.action)}</span>
                                  <span className="flex-1 text-foreground">{getEventLabel(event)}</span>
                                  <span className="shrink-0 text-muted-foreground">
                                    {format(new Date(event.createdAt), "MMM d, HH:mm", { locale: dateLocale })}
                                  </span>
                                </div>
                              ))
                            )}
                          </div>
                        )}
                      </div>

                      {displayStatus === "expired" && (
                        <div className="mt-4 rounded-xl border border-dashed border-muted-foreground/30 bg-muted/20 px-4 py-3">
                          <p className="text-sm text-muted-foreground">
                            {request.matchFormat === "doubles"
                              ? t("invites.expiredNotEnough")
                              : t("invites.expiredNoOne")}
                          </p>
                          <div className="mt-3 flex flex-wrap gap-2">
                            <AddContactsToInvite
                              requestId={request.id}
                              existingContactIds={request.contacts.map((c) => c.contactUserId)}
                              hostUserId={currentUserId}
                              onSuccess={() => fetchSchedulingData(false)}
                            />
                            <Button size="sm" onClick={() => setWizardOpen(true)}>
                              <Zap className="mr-1.5 h-3.5 w-3.5" />
                              {t("invites.newRequest")}
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="gap-1.5 text-destructive hover:bg-destructive/10 hover:text-destructive"
                              onClick={() => setCancelConfirm(request.id)}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                              {t("invites.actions.cancelRequest")}
                            </Button>
                          </div>
                        </div>
                      )}
                      {displayStatus !== "matched" &&
                        displayStatus !== "expired" &&
                        displayStatus !== "cancelled" && (
                          <div className="mt-4 space-y-3 border-t border-border/30 pt-4">
                            <div className="flex flex-wrap gap-2">
                              <AddContactsToInvite
                                requestId={request.id}
                                existingContactIds={request.contacts.map((c) => c.contactUserId)}
                                hostUserId={currentUserId}
                                onSuccess={() => fetchSchedulingData(false)}
                              />
                              <Button
                                variant="ghost"
                                size="sm"
                                className="gap-1.5 text-destructive hover:bg-destructive/10 hover:text-destructive"
                                onClick={() => setCancelConfirm(request.id)}
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                                {t("invites.actions.cancelRequest")}
                              </Button>
                            </div>
                          </div>
                        )}

                      {request.status === "matched" && (
                        <div className="mt-4 flex flex-wrap gap-2">
                          {request.matchId && (
                            <Button size="sm" className="gap-1.5" asChild>
                              <Link to={`/matches/${request.matchId}`}>
                                <ExternalLink className="h-3.5 w-3.5" />
                                {t("invites.actions.goToMatch")}
                              </Link>
                            </Button>
                          )}
                          {request.whatsappGroupId && request.matchId ? (
                            <Button
                              size="sm"
                              className="gap-1.5 bg-[#25D366] text-white hover:bg-[#25D366]/90"
                              onClick={() => handleOpenWhatsappGroup(request.matchId!, request.id)}
                              disabled={groupLinkLoadingId === request.id}
                            >
                              {groupLinkLoadingId === request.id
                                ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                : <CheckCircle className="h-3.5 w-3.5" />
                              }
                              {t("invites.actions.openWhatsApp")}
                            </Button>
                          ) : (
                            <Button
                              size="sm"
                              className="gap-1.5 bg-[#25D366] text-white hover:bg-[#25D366]/90"
                              disabled
                              title={t("invites.whatsappNotAvailable")}
                            >
                              <CheckCircle className="h-3.5 w-3.5" />
                              {t("invites.actions.openWhatsApp")}
                            </Button>
                          )}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                  );
                })}
              </div>
            )}
          </>
        )}
    </div>
  )

  const standaloneHeader = variant === "standalone" && (
    <div className="flex items-center gap-2 sm:gap-3">
      <span className="hidden text-sm text-muted-foreground sm:inline">
        <span
          className={
            atCapacity ? "font-semibold text-destructive" : "font-semibold text-foreground"
          }
        >
          {activeRequestCount}
        </span>
        <span> {t("invites.activeSuffix", { max: MAX_ACTIVE_REQUESTS })}</span>
      </span>
      <Button
        size="sm"
        className="gap-2 shadow-lg shadow-primary/20 sm:h-11 sm:rounded-lg sm:px-6"
        onClick={() => setWizardOpen(true)}
        disabled={atCapacity}
        title={
          atCapacity
            ? t("invites.atCapacityTooltip", { max: MAX_ACTIVE_REQUESTS })
            : t("common.iWantToPlay")
        }
      >
        <Zap className="h-4 w-4 sm:h-5 sm:w-5" />
        <span className="hidden sm:inline">{t("common.iWantToPlay")}</span>
      </Button>
    </div>
  )

  return (
    <>
      {variant === "standalone" ? (
        <>
          <PageHeader title={pageTitle} description={pageDescription}>
            {standaloneHeader}
          </PageHeader>
          <div className="flex flex-1 flex-col gap-6 p-5 lg:p-8">{content}</div>
        </>
      ) : (
        content
      )}

      {renderWizard && (
        <IWantToPlayWizard
          open={wizardOpen}
          onOpenChange={setWizardOpen}
          hostUserId={currentUserId}
          onSuccess={() => {
            schedulingService
              .listByHost(currentUserId)
              .then((requestsRes) => {
                const mapped = requestsRes
                  .map((r) => mapSchedulingToInviteRequest(r, t))
                  .filter((r): r is InviteRequest => r !== null)
                setInviteRequests(mapped)
              })
              .catch(() => {})
          }}
        />
      )}

      <AlertDialog
        open={!!cancelConfirm}
        onOpenChange={(open) => !open && setCancelConfirm(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("invites.cancelRequestDialog.title")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("invites.cancelRequestDialog.description")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("invites.cancelRequestDialog.keep")}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => cancelConfirm && handleCancelRequest(cancelConfirm)}
            >
              {t("invites.cancelRequestDialog.confirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={!!acceptConfirm}
        onOpenChange={(open) => !open && setAcceptConfirm(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Accept candidate</AlertDialogTitle>
            <AlertDialogDescription>
              Accept {acceptConfirm?.contactName ?? "this person"} for this match? This will mark
              them as confirmed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() =>
                acceptConfirm &&
                handleManualAccept(acceptConfirm.requestId, acceptConfirm.candidateId)
              }
            >
              Accept
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
