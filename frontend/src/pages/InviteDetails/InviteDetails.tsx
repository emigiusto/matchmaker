import { useState, useEffect, useCallback, useRef } from "react"
import { Link, useParams } from "react-router-dom"
import { format } from "date-fns"
import { es as esLocale } from "date-fns/locale"
import {
  ArrowLeft,
  Calendar,
  Clock,
  MapPin,
  CheckCircle,
  XCircle,
  Loader2,
  UserCheck,
  UserX,
  Hourglass,
  PhoneOff,
  RotateCcw,
  Link2,
  Copy,
  Check,
  ExternalLink,
  Trash2,
  CirclePlay,
  History,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { PageHeader } from "@/components/page-header"
import { SportFormatBadge } from "@/components/sport-format-badge"
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
import { getCurrentUserId } from "@/lib/current-user"
import { useTranslation } from "@/lib/i18n"
import { matchesService } from "@/lib/services/matches.service"
import {
  schedulingService,
  type SchedulingRequestDTO,
  type SchedulingCandidateDTO,
  type SchedulingInviteEventDTO,
} from "@/lib/services/scheduling.service"

const POLL_INTERVAL_MS = 5000

type ContactStatus = "pending" | "contacted" | "declined" | "accepted" | "no_response" | "cancelled" | "send_failed"

function mapCandidateStatus(s: SchedulingCandidateDTO["status"]): ContactStatus {
  const map: Record<SchedulingCandidateDTO["status"], ContactStatus> = {
    pending: "pending",
    contacted: "contacted",
    waiting_reply: "contacted",
    accepted: "accepted",
    declined: "declined",
    expired: "no_response",
    cancelled: "cancelled",
    send_failed: "send_failed",
  }
  return map[s] ?? "pending"
}

function formatResponseWindow(minutes: number, t: (key: string, params?: Record<string, string | number>) => string): string {
  if (minutes < 60) return t("inviteDetails.responseWindowMin", { n: Math.round(minutes) })
  const hours = minutes / 60
  if (hours < 24) return t("inviteDetails.responseWindowH", { n: Math.round(hours) })
  const days = Math.round(hours / 24)
  return t(days === 1 ? "inviteDetails.responseWindowDay" : "inviteDetails.responseWindowDays", { n: days })
}

function formatTimeRange(startIso: string, endIso: string): string {
  try {
    return `${format(new Date(startIso), "HH:mm")} - ${format(new Date(endIso), "HH:mm")}`
  } catch {
    return ""
  }
}

function getDisplayStatus(r: SchedulingRequestDTO) {
  const candidates = r.candidates ?? []
  const hasActiveContact = candidates.some(
    (c) => c.status === "contacted" || c.status === "waiting_reply"
  )
  if (r.status === "expired" && hasActiveContact) return "scheduling"
  if (r.status === "active") {
    if (candidates.length > 0) {
      const hasInProgress = candidates.some(
        (c) => c.status === "pending" || c.status === "contacted" || c.status === "waiting_reply"
      )
      if (!hasInProgress) return "expired"
    }
    return "scheduling"
  }
  if (r.status === "completed") return "matched"
  return r.status
}

function getEventLabel(event: SchedulingInviteEventDTO, t: (key: string, params?: Record<string, string | number>) => string, currentUserId?: string): string {
  const name = event.candidateUserName ?? t("common.unknown")
  switch (event.action) {
    case "invite_sent": return t("invites.events.inviteSent", { name })
    case "invite_accepted": return t("invites.events.inviteAccepted", { name })
    case "invite_link_accepted": return t("inviteDetails.events.inviteLinkAccepted", { name: event.metadata?.userName as string ?? name })
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
    default: return event.action
  }
}

function getEventIcon(action: SchedulingInviteEventDTO["action"]) {
  switch (action) {
    case "invite_sent": return <Loader2 className="h-3.5 w-3.5 text-blue-500" />
    case "invite_accepted": return <UserCheck className="h-3.5 w-3.5 text-green-600" />
    case "invite_link_accepted": return <UserCheck className="h-3.5 w-3.5 text-green-600" />
    case "invite_declined": return <UserX className="h-3.5 w-3.5 text-red-500" />
    case "invite_expired": return <Hourglass className="h-3.5 w-3.5 text-muted-foreground" />
    case "candidate_cancelled": return <XCircle className="h-3.5 w-3.5 text-amber-500" />
    case "candidate_retried": return <RotateCcw className="h-3.5 w-3.5 text-muted-foreground" />
    case "candidates_added": return <UserCheck className="h-3.5 w-3.5 text-muted-foreground" />
    case "request_started": return <CirclePlay className="h-3.5 w-3.5 text-blue-500" />
    case "request_cancelled": return <XCircle className="h-3.5 w-3.5 text-muted-foreground" />
    case "request_completed": return <CheckCircle className="h-3.5 w-3.5 text-green-600" />
    case "request_expired": return <XCircle className="h-3.5 w-3.5 text-muted-foreground" />
    default: return <Clock className="h-3.5 w-3.5 text-muted-foreground" />
  }
}

export default function InviteDetailsPage() {
  const { t, language } = useTranslation()
  const dateLocale = language === "es" ? esLocale : undefined
  const { requestId } = useParams<{ requestId: string }>()
  const currentUserId = getCurrentUserId()

  const [request, setRequest] = useState<SchedulingRequestDTO | null>(null)
  const [events, setEvents] = useState<SchedulingInviteEventDTO[]>([])
  const [loading, setLoading] = useState(true)
  const [eventsLoading, setEventsLoading] = useState(true)
  const [copiedLink, setCopiedLink] = useState(false)
  const historyBottomRef = useRef<HTMLDivElement>(null)
  const prevEventsCountRef = useRef(0)
  const [acceptConfirm, setAcceptConfirm] = useState<{
    candidateId: string
    contactName: string
  } | null>(null)
  const [pendingAction, setPendingAction] = useState<{
    candidateId: string
    action: "accept" | "cancel" | "retry" | "cancelAccepted"
  } | null>(null)
  const [fetchingGroupLink, setFetchingGroupLink] = useState(false)

  async function handleOpenWhatsappGroup(matchId: string) {
    setFetchingGroupLink(true)
    try {
      const link = await matchesService.getWhatsappGroupLink(matchId)
      window.open(link, "_blank", "noopener,noreferrer")
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("errors.generic"))
    } finally {
      setFetchingGroupLink(false)
    }
  }

  const fetchRequest = useCallback(async (initial = false) => {
    if (!requestId) return
    if (initial) setLoading(true)
    try {
      const data = await schedulingService.getById(requestId)
      setRequest(data)
    } catch {
      if (initial) setRequest(null)
    } finally {
      if (initial) setLoading(false)
    }
  }, [requestId])

  const fetchEvents = useCallback(async () => {
    if (!requestId) return
    try {
      const data = await schedulingService.getEvents(requestId)
      setEvents(data)
    } catch {
      setEvents([])
    } finally {
      setEventsLoading(false)
    }
  }, [requestId])

  useEffect(() => {
    fetchRequest(true)
    fetchEvents()
  }, [fetchRequest, fetchEvents])

  useEffect(() => {
    if (events.length > prevEventsCountRef.current) {
      historyBottomRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" })
    }
    prevEventsCountRef.current = events.length
  }, [events])

  // Poll when active
  useEffect(() => {
    if (!request) return
    const displayStatus = getDisplayStatus(request)
    if (displayStatus !== "scheduling") return
    const interval = setInterval(() => {
      fetchRequest()
      fetchEvents()
    }, POLL_INTERVAL_MS)
    return () => clearInterval(interval)
  }, [request, fetchRequest, fetchEvents])

  async function handleCancelRequest() {
    if (!requestId) return
    try {
      const updated = await schedulingService.cancel(requestId, currentUserId)
      setRequest(updated)
      toast.success(t("inviteDetails.toast.requestCancelled"))
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("inviteDetails.toast.cancelFailed"))
    }
  }

  async function handleCancelContact(candidateId: string) {
    if (!requestId) return
    setPendingAction({ candidateId, action: "cancel" })
    try {
      const updated = await schedulingService.cancelContacted(requestId, candidateId, currentUserId)
      setRequest(updated)
      await fetchEvents()
      toast.success(t("inviteDetails.toast.inviteCancelled"))
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("inviteDetails.toast.cancelFailed"))
    } finally {
      setPendingAction(null)
    }
  }

  async function handleCancelAccepted(candidateId: string) {
    if (!requestId) return
    setPendingAction({ candidateId, action: "cancelAccepted" })
    try {
      const updated = await schedulingService.cancelAccepted(requestId, candidateId, currentUserId)
      setRequest(updated)
      await fetchEvents()
      toast.success(t("inviteDetails.toast.acceptanceCancelled"))
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("inviteDetails.toast.cancelAcceptanceFailed"))
    } finally {
      setPendingAction(null)
    }
  }

  async function handleManualAccept(candidateId: string) {
    if (!requestId) return
    setPendingAction({ candidateId, action: "accept" })
    try {
      const updated = await schedulingService.manualAccept(requestId, candidateId, currentUserId)
      setRequest(updated)
      await fetchEvents()
      setAcceptConfirm(null)
      toast.success(t("inviteDetails.toast.candidateAccepted"))
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("inviteDetails.toast.acceptFailed"))
    } finally {
      setPendingAction(null)
    }
  }

  async function handleRetry(candidateId: string) {
    if (!requestId) return
    setPendingAction({ candidateId, action: "retry" })
    try {
      const updated = await schedulingService.retry(requestId, candidateId, currentUserId)
      setRequest(updated)
      await fetchEvents()
      toast.success(t("inviteDetails.toast.retryQueued"))
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("inviteDetails.toast.retryFailed"))
    } finally {
      setPendingAction(null)
    }
  }

  async function handleCopyLink() {
    if (!request) return
    try {
      const link = await schedulingService.getInviteLink(request.id, window.location.origin)
      const fullUrl = link.startsWith("http") ? link : `${window.location.origin}${link}`
      await navigator.clipboard.writeText(fullUrl)
    } catch {
      navigator.clipboard.writeText(
        `${window.location.origin}/join/${request.inviteToken}`
      )
    }
    setCopiedLink(true)
    toast.success(t("inviteDetails.toast.linkCopied"))
    setTimeout(() => setCopiedLink(false), 2000)
  }

  function handleShareWhatsApp() {
    if (!request) return
    const link = `${window.location.origin}/join/${request.inviteToken}`
    const message = encodeURIComponent(`Join my match! ${link}`)
    window.open(`https://wa.me/?text=${message}`, "_blank")
  }

  if (loading) {
    return (
      <>
        <PageHeader title={t("inviteDetails.title")} />
        <div className="flex flex-1 items-center justify-center p-8">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </>
    )
  }

  if (!request) {
    return (
      <>
        <PageHeader title={t("inviteDetails.title")} />
        <div className="flex flex-1 flex-col items-center justify-center gap-4 p-8">
          <p className="text-muted-foreground">{t("inviteDetails.notFound")}</p>
          <Button variant="outline" asChild>
            <Link to="/play">{t("invites.actions.backToInvites")}</Link>
          </Button>
        </div>
      </>
    )
  }

  const displayStatus = getDisplayStatus(request)
  const candidates = request.candidates ?? []
  const timeStr = formatTimeRange(request.startTime, request.endTime)

  return (
    <>
      <PageHeader
        title={t("inviteDetails.title")}
        description={
          request.sportType === "padel"
            ? t("sportFormat.padel")
            : request.format === "doubles"
              ? t("sportFormat.tennisDoubles")
              : t("sportFormat.tennisSingles")
        }
      >
        <Button variant="ghost" size="sm" className="gap-1.5" asChild>
          <Link to="/play">
            <ArrowLeft className="h-4 w-4" />
            {t("common.back")}
          </Link>
        </Button>
      </PageHeader>

      <div className="flex flex-1 flex-col gap-6 p-5 lg:p-8">
        {/* Status + sport */}
        <div className="flex flex-wrap items-center gap-2">
          <SportFormatBadge sport={request.sportType} format={request.format} />
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
          {displayStatus === "expired" && (
            <span className="inline-flex items-center gap-1.5 rounded-md border border-border bg-muted/60 px-2.5 py-1 text-xs font-medium text-muted-foreground">
              <XCircle className="h-3.5 w-3.5 shrink-0" />
              {t("invites.status.expired")}
            </span>
          )}
          {displayStatus === "cancelled" && (
            <span className="inline-flex items-center gap-1.5 rounded-md border border-border bg-muted/60 px-2.5 py-1 text-xs font-medium text-muted-foreground">
              <XCircle className="h-3.5 w-3.5 shrink-0" />
              {t("invites.status.cancelled")}
            </span>
          )}
        </div>

        {/* Meta info */}
        <Card>
          <CardContent className="grid gap-3 p-5 sm:grid-cols-2">
            <div className="flex items-center gap-2 text-sm">
              <Calendar className="h-4 w-4 shrink-0 text-primary" />
              <span>{format(new Date(request.date), "EEEE, MMMM d, yyyy", { locale: dateLocale })}</span>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <Clock className="h-4 w-4 shrink-0 text-primary" />
              <span>{timeStr}</span>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <MapPin className="h-4 w-4 shrink-0 text-primary" />
              <span>{request.locationText?.trim() || t("common.tbd")}</span>
            </div>
            {displayStatus === "scheduling" && (
              <div className="flex items-center gap-2 text-sm">
                <Hourglass className="h-4 w-4 shrink-0 text-primary" />
                <span>{t("inviteDetails.replyWindow")} {formatResponseWindow(request.responseWindowMinutes, t)}</span>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Matched: go to match / WhatsApp group */}
        {displayStatus === "matched" && (
          <div className="flex flex-wrap gap-2">
            {request.matchId && (
              <Button className="gap-1.5" asChild>
                <Link to={`/matches/${request.matchId}`}>
                  <ExternalLink className="h-4 w-4" />
                  {t("invites.actions.goToMatch")}
                </Link>
              </Button>
            )}
            {request.whatsappGroupId && request.matchId ? (
              <Button
                className="gap-1.5 bg-[#25D366] text-white hover:bg-[#25D366]/90"
                onClick={() => handleOpenWhatsappGroup(request.matchId!)}
                disabled={fetchingGroupLink}
              >
                {fetchingGroupLink
                  ? <Loader2 className="h-4 w-4 animate-spin" />
                  : <CheckCircle className="h-4 w-4" />
                }
                {t("invites.actions.openWhatsApp")}
              </Button>
            ) : (
              <Button
                className="gap-1.5 bg-[#25D366] text-white hover:bg-[#25D366]/90"
                disabled
              >
                <CheckCircle className="h-4 w-4" />
                {t("invites.actions.openWhatsApp")}
              </Button>
            )}
          </div>
        )}

        {/* Actions (active / expired) */}
        {displayStatus !== "matched" && displayStatus !== "cancelled" && (
          <div className="flex flex-wrap gap-2">
            <AddContactsToInvite
              requestId={request.id}
              existingContactIds={candidates.map((c) => c.contactUserId)}
              hostUserId={currentUserId}
              onSuccess={() => { fetchRequest(); fetchEvents() }}
            />
            <Button variant="outline" size="sm" className="gap-1.5" onClick={handleCopyLink}>
              {copiedLink ? <><Check className="h-3.5 w-3.5" /> {t("invites.actions.copied")}</> : <><Copy className="h-3.5 w-3.5" /> {t("invites.actions.copyLink")}</>}
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5 text-[#25D366] hover:border-[#25D366]/40 hover:bg-[#25D366]/10 hover:text-[#25D366]"
              onClick={handleShareWhatsApp}
            >
              <Link2 className="h-3.5 w-3.5" />
              {t("invites.actions.whatsapp")}
            </Button>
            {displayStatus === "scheduling" && (
              <Button
                variant="ghost"
                size="sm"
                className="gap-1.5 text-destructive hover:bg-destructive/10 hover:text-destructive"
                onClick={handleCancelRequest}
              >
                <Trash2 className="h-3.5 w-3.5" />
                {t("invites.actions.cancelRequest")}
              </Button>
            )}
          </div>
        )}

        {/* Candidates */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">{t("inviteDetails.progress")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 pt-0">
            {candidates.length === 0 && (
              <p className="text-sm text-muted-foreground">{t("inviteDetails.noCandidates")}</p>
            )}
            {candidates.map((candidate, idx) => {
              const uiStatus = mapCandidateStatus(candidate.status)
              const contactName = candidate.contactUserName ?? t("common.unknown")
              return (
                <div
                  key={candidate.id}
                  className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium ${
                    uiStatus === "accepted"
                      ? "bg-green-500/10"
                      : uiStatus === "declined"
                        ? "bg-red-500/10"
                        : uiStatus === "cancelled"
                          ? "bg-amber-500/10"
                          : uiStatus === "no_response"
                            ? "bg-muted/60"
                            : uiStatus === "send_failed"
                              ? "bg-orange-500/10"
                              : uiStatus === "contacted"
                                ? "bg-blue-500/10"
                                : "bg-muted/30"
                  }`}
                >
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center">
                    {uiStatus === "accepted" && <UserCheck className="h-4 w-4 text-green-600" />}
                    {uiStatus === "declined" && <UserX className="h-4 w-4 text-red-500" />}
                    {uiStatus === "cancelled" && <XCircle className="h-4 w-4 text-amber-600" />}
                    {uiStatus === "no_response" && <Hourglass className="h-4 w-4 text-muted-foreground" />}
                    {uiStatus === "send_failed" && <PhoneOff className="h-4 w-4 text-orange-500" />}
                    {uiStatus === "contacted" && displayStatus === "scheduling" && <Loader2 className="h-4 w-4 animate-spin text-blue-600" />}
                    {uiStatus === "contacted" && displayStatus !== "scheduling" && <Hourglass className="h-4 w-4 text-muted-foreground" />}
                    {uiStatus === "pending" && (
                      <span className="text-xs font-bold text-muted-foreground">{idx + 1}</span>
                    )}
                  </span>
                  <span
                    className={`min-w-0 flex-1 truncate ${
                      uiStatus === "declined" || uiStatus === "no_response" || uiStatus === "cancelled" || uiStatus === "send_failed"
                        ? "text-muted-foreground line-through"
                        : "text-foreground"
                    }`}
                  >
                    {contactName}
                  </span>
                  <span className="text-xs text-muted-foreground">{t(`invites.candidateStatus.${uiStatus}`)}</span>
                  {/* Actions */}
                  <div className="flex items-center gap-1">
                    {displayStatus !== "matched" &&
                      displayStatus !== "cancelled" &&
                      (uiStatus === "pending" || uiStatus === "contacted" || uiStatus === "no_response" || uiStatus === "cancelled") && (() => {
                        const busy = pendingAction?.candidateId === candidate.id && pendingAction.action === "accept"
                        return (
                          <button
                            onClick={() => setAcceptConfirm({ candidateId: candidate.id, contactName })}
                            disabled={!!pendingAction}
                            title={t("invites.actions.accept")}
                            className="rounded p-1 text-green-600 transition-colors hover:bg-green-500/10 disabled:opacity-50"
                          >
                            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <UserCheck className="h-3.5 w-3.5" />}
                          </button>
                        )
                      })()}
                    {displayStatus !== "matched" &&
                      displayStatus !== "cancelled" &&
                      uiStatus === "contacted" && (() => {
                        const busy = pendingAction?.candidateId === candidate.id && pendingAction.action === "cancel"
                        return (
                          <button
                            onClick={() => handleCancelContact(candidate.id)}
                            disabled={!!pendingAction}
                            title={t("invites.actions.cancelInvite")}
                            className="rounded p-1 text-muted-foreground transition-colors hover:text-destructive disabled:opacity-50"
                          >
                            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <XCircle className="h-3.5 w-3.5" />}
                          </button>
                        )
                      })()}
                    {displayStatus !== "matched" &&
                      displayStatus !== "cancelled" &&
                      (uiStatus === "no_response" || uiStatus === "cancelled" || uiStatus === "send_failed") && (() => {
                        const busy = pendingAction?.candidateId === candidate.id && pendingAction.action === "retry"
                        return (
                          <button
                            onClick={() => handleRetry(candidate.id)}
                            disabled={!!pendingAction}
                            title={t("invites.actions.retryInvite")}
                            className="rounded p-1 text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50"
                          >
                            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5" />}
                          </button>
                        )
                      })()}
                    {(displayStatus === "scheduling" || displayStatus === "expired") &&
                      uiStatus === "accepted" && (() => {
                        const busy = pendingAction?.candidateId === candidate.id && pendingAction.action === "cancelAccepted"
                        return (
                          <button
                            onClick={() => handleCancelAccepted(candidate.id)}
                            disabled={!!pendingAction}
                            title={t("invites.actions.cancelAcceptance")}
                            className="rounded p-1 text-muted-foreground transition-colors hover:text-destructive disabled:opacity-50"
                          >
                            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <XCircle className="h-3.5 w-3.5" />}
                          </button>
                        )
                      })()}
                  </div>
                </div>
              )
            })}
          </CardContent>
        </Card>

        {/* History */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <History className="h-4 w-4" />
              {t("inviteDetails.history")}
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            {eventsLoading ? (
              <div className="flex items-center justify-center py-6">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : events.length === 0 ? (
              <p className="py-4 text-center text-sm text-muted-foreground">{t("inviteDetails.noEvents")}</p>
            ) : (
              <div className="relative">
                {/* Timeline line */}
                <div className="absolute left-[15px] top-2 bottom-2 w-px bg-border" />
                <div className="space-y-1">
                  {events.map((event) => (
                    <div key={event.id} className="relative flex items-start gap-4 py-2 pl-9">
                      {/* Dot */}
                      <span className="absolute left-[9px] mt-0.5 flex h-[13px] w-[13px] items-center justify-center rounded-full bg-background ring-1 ring-border">
                        {getEventIcon(event.action)}
                      </span>
                      <div className="flex flex-1 items-baseline justify-between gap-2">
                        <span className="text-sm text-foreground">{getEventLabel(event, t, currentUserId)}</span>
                        <span className="shrink-0 text-xs text-muted-foreground">
                          {format(new Date(event.createdAt), "MMM d, HH:mm", { locale: dateLocale })}
                        </span>
                      </div>
                    </div>
                  ))}
                  <div ref={historyBottomRef} />
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <AlertDialog open={!!acceptConfirm} onOpenChange={(open) => !open && setAcceptConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("inviteDetails.confirmDialog.title")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("inviteDetails.confirmDialog.description", { name: acceptConfirm?.contactName ?? t("common.unknown") })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("inviteDetails.confirmDialog.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => acceptConfirm && handleManualAccept(acceptConfirm.candidateId)}
            >
              {t("inviteDetails.confirmDialog.accept")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
