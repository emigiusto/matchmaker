import { useState, useEffect } from "react"
import { format } from "date-fns"
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
  Hourglass,
  RotateCcw,
  Link2,
  Copy,
  Check,
  ExternalLink,
} from "lucide-react"
import { SportFormatBadge } from "@/components/sport-format-badge"
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
import { PageHeader } from "@/components/page-header"

export interface InviteRequest {
  id: string
  inviteToken: string
  date: string
  time: string
  location: string
  matchType: "competitive" | "practice"
  sport: "tennis" | "padel"
  matchFormat: "singles" | "doubles"
  status: "scheduling" | "matched" | "expired" | "cancelled"
  matchId: string | null
  whatsappGroupId: string | null
  responseWindowMinutes: number
  contacts: {
    id: string
    contactUserId: string
    name: string
    status: "pending" | "contacted" | "declined" | "accepted" | "no_response" | "cancelled"
    contactedAt: string | null
  }[]
  currentIndex: number
}

const MAX_ACTIVE_REQUESTS = 5
const SCHEDULING_POLL_INTERVAL_MS = 5000

function formatResponseWindow(minutes: number): string {
  if (minutes < 60) return `${Math.round(minutes)} min`
  const hours = minutes / 60
  if (hours < 24) return `${Math.round(hours)}h`
  const days = hours / 24
  return `${Math.round(days)} day${Math.round(days) === 1 ? "" : "s"}`
}

function formatTimeLeft(contactedAt: string, responseWindowMinutes: number): string {
  const contacted = new Date(contactedAt).getTime()
  const expiresAt = contacted + responseWindowMinutes * 60 * 1000
  const now = Date.now()
  const msLeft = expiresAt - now
  if (msLeft <= 0) return "Expired"
  const mins = Math.floor(msLeft / 60_000)
  const hours = Math.floor(mins / 60)
  if (hours >= 1) return `${hours}h ${mins % 60}m left`
  if (mins >= 1) return `${mins} min left`
  return "< 1 min left"
}

/** Renders time left until invite expires; re-renders every 30s for live countdown */
function TimeLeftBadge({
  contactedAt,
  responseWindowMinutes,
}: {
  contactedAt: string
  responseWindowMinutes: number
}) {
  const [, tick] = useState(0)
  useEffect(() => {
    const id = setInterval(() => tick((n) => n + 1), 30_000)
    return () => clearInterval(id)
  }, [])
  const text = formatTimeLeft(contactedAt, responseWindowMinutes)
  const isExpired = text === "Expired"
  return (
    <span
      className={`text-[10px] font-medium ${
        isExpired ? "text-muted-foreground" : "text-blue-600"
      }`}
    >
      {text}
    </span>
  )
}

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
  r: import("@/lib/services/scheduling.service").SchedulingRequestDTO
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
  }
  const dateStr = r.date.slice(0, 10)
  const timeStr = formatTimeRange(r.startTime, r.endTime)
  const candidates = r.candidates ?? []
  const contacts = candidates.map((c) => ({
    id: c.id,
    contactUserId: c.contactUserId,
    name: c.contactUserName ?? "Unknown",
    status: contactStatusMap[c.status] ?? "pending",
    contactedAt: c.contactedAt ?? null,
  }))
  return {
    id: r.id,
    inviteToken: r.inviteToken,
    date: dateStr,
    time: timeStr,
    location: r.locationText,
    matchType: r.matchType,
    sport: r.sportType,
    matchFormat: r.format,
    status: statusMap[r.status] ?? "scheduling",
    matchId: r.matchId ?? null,
    whatsappGroupId: r.whatsappGroupId ?? null,
    responseWindowMinutes: r.responseWindowMinutes ?? 240,
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
  const [inviteRequests, setInviteRequests] = useState<InviteRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [copiedRequestId, setCopiedRequestId] = useState<string | null>(null)
  const [acceptConfirm, setAcceptConfirm] = useState<{
    requestId: string
    candidateId: string
    contactName: string
  } | null>(null)
  type InviteFilter = "all" | "scheduling" | "no_match" | "completed" | "cancelled"
  const [inviteFilter, setInviteFilter] = useState<InviteFilter>("all")

  async function fetchSchedulingData(isInitial = false) {
    if (isInitial) setLoading(true)
    try {
      const requestsRes = await schedulingService.listByHost(currentUserId)
      const mapped = requestsRes
        .map(mapSchedulingToInviteRequest)
        .filter((r): r is InviteRequest => r !== null)
      setInviteRequests(mapped)
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

  const getDisplayStatus = (r: InviteRequest) => {
    const hasActiveContact = r.contacts.some((c) => c.status === "contacted")
    return r.status === "expired" && hasActiveContact ? "scheduling" : r.status
  }
  const filteredRequests = inviteRequests.filter((r) => {
    const displayStatus = getDisplayStatus(r)
    if (inviteFilter === "all") return displayStatus !== "cancelled"
    if (inviteFilter === "scheduling") return displayStatus === "scheduling"
    if (inviteFilter === "no_match") return displayStatus === "expired"
    if (inviteFilter === "completed") return displayStatus === "matched"
    if (inviteFilter === "cancelled") return displayStatus === "cancelled"
    return true
  })

  function switchToFilterForStatus(status: InviteRequest["status"], forceSwitch = false) {
    if (inviteFilter === "all" && !forceSwitch) return
    if (status === "scheduling") setInviteFilter("scheduling")
    else if (status === "expired") setInviteFilter("no_match")
    else if (status === "cancelled") setInviteFilter("cancelled")
    else if (status === "matched") setInviteFilter("completed")
  }

  const activeRequestCount = inviteRequests.filter(
    (r) => r.status === "scheduling"
  ).length
  const atCapacity = activeRequestCount >= MAX_ACTIVE_REQUESTS

  async function handleCancelRequest(id: string) {
    try {
      const updated = await schedulingService.cancel(id, currentUserId)
      const mapped = mapSchedulingToInviteRequest(updated)
      if (mapped) {
        setInviteRequests((prev) => prev.map((r) => (r.id === id ? mapped : r)))
        switchToFilterForStatus(mapped.status, true)
      }
      toast.success("Invite request cancelled")
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to cancel request")
    }
  }

  async function handleCancelContact(requestId: string, candidateId: string) {
    try {
      const updated = await schedulingService.cancelContacted(requestId, candidateId, currentUserId)
      const mapped = mapSchedulingToInviteRequest(updated)
      if (mapped) {
        setInviteRequests((prev) => prev.map((r) => (r.id === requestId ? mapped : r)))
        switchToFilterForStatus(mapped.status)
        toast.success("Cancelled invite")
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to cancel")
    }
  }

  async function handleRemoveContact(requestId: string, candidateId: string) {
    try {
      const updated = await schedulingService.removeCandidate(requestId, candidateId, currentUserId)
      const mapped = mapSchedulingToInviteRequest(updated)
      if (mapped) {
        setInviteRequests((prev) => prev.map((r) => (r.id === requestId ? mapped : r)))
        switchToFilterForStatus(mapped.status)
        toast.success("Removed from queue")
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to remove")
    }
  }

  async function handleCancelAccepted(requestId: string, candidateId: string) {
    try {
      const updated = await schedulingService.cancelAccepted(requestId, candidateId, currentUserId)
      const mapped = mapSchedulingToInviteRequest(updated)
      if (mapped) {
        setInviteRequests((prev) => prev.map((r) => (r.id === requestId ? mapped : r)))
        switchToFilterForStatus(mapped.status)
        toast.success("Acceptance cancelled")
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to cancel")
    }
  }

  async function handleManualAccept(requestId: string, candidateId: string) {
    try {
      const updated = await schedulingService.manualAccept(requestId, candidateId, currentUserId)
      const mapped = mapSchedulingToInviteRequest(updated)
      if (mapped) {
        setInviteRequests((prev) => prev.map((r) => (r.id === requestId ? mapped : r)))
        switchToFilterForStatus(mapped.status)
        toast.success("Match confirmed!")
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to accept")
    } finally {
      setAcceptConfirm(null)
    }
  }

  async function handleRetryContact(requestId: string, candidateId: string) {
    try {
      const updated = await schedulingService.retry(requestId, candidateId, currentUserId)
      const mapped = mapSchedulingToInviteRequest(updated)
      if (mapped) {
        setInviteRequests((prev) => prev.map((r) => (r.id === requestId ? mapped : r)))
        switchToFilterForStatus(mapped.status)
        toast.success("Invite will be retried")
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to retry invite")
    }
  }

  function handleShareWhatsApp(request: InviteRequest) {
    const message = encodeURIComponent(
      `Want to play ${request.sport} on ${format(new Date(request.date), "EEE, MMM d")} (${request.time}) at ${request.location}? Accept my invite here:\n\n${window.location.origin}/play?invite=${request.inviteToken}`
    )
    window.open(`https://wa.me/?text=${message}`, "_blank")
  }

  async function handleCopyRequestLink(request: InviteRequest) {
    try {
      const link = await schedulingService.getInviteLink(request.id, window.location.origin)
      const fullUrl = link.startsWith("http") ? link : `${window.location.origin}${link}`
      await navigator.clipboard.writeText(fullUrl)
      setCopiedRequestId(request.id)
      toast.success("Invite link copied")
      setTimeout(() => setCopiedRequestId(null), 2000)
    } catch {
      const fallback = `${window.location.origin}/play?invite=${request.inviteToken}`
      await navigator.clipboard.writeText(fallback)
      setCopiedRequestId(request.id)
      toast.success("Invite link copied")
      setTimeout(() => setCopiedRequestId(null), 2000)
    }
  }

  const content = (
    <div className="flex flex-col gap-4">
      {headerAction && variant === "embedded" && (
        <div className="flex items-center justify-end">{headerAction}</div>
      )}
      <div className="flex flex-wrap items-center gap-2">
          {(["all", "scheduling", "no_match", "completed", "cancelled"] as const).map((f) => (
            <Button
              key={f}
              variant={inviteFilter === f ? "default" : "outline"}
              size="sm"
              onClick={() => setInviteFilter(f)}
            >
              {f === "all" && "Active"}
              {f === "scheduling" && "Scheduling"}
              {f === "no_match" && "No Match"}
              {f === "completed" && "Confirmed"}
              {f === "cancelled" && "Cancelled"}
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
                You have reached the limit of {MAX_ACTIVE_REQUESTS} active scheduling requests. Cancel
                or finish one to start a new one.
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
                      ? "No invites yet"
                      : inviteFilter === "all"
                        ? "No active invites"
                        : inviteFilter === "scheduling"
                          ? "No scheduling invites"
                          : inviteFilter === "no_match"
                            ? "No expired invites"
                            : inviteFilter === "cancelled"
                              ? "No cancelled invites"
                              : "No confirmed matches"}
                  </p>
                  <p className="mt-1 text-base text-muted-foreground">
                    {inviteRequests.length === 0
                      ? 'Tap "I Want to Play" to create your first invite'
                      : "Try another filter"}
                  </p>
                  <Button size="lg" className="mt-6 gap-2" onClick={() => setWizardOpen(true)}>
                    <Zap className="h-5 w-5" />
                    I Want to Play
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
                      <div className="flex items-start justify-between">
                        <div className="flex flex-wrap items-center gap-2">
                          <SportFormatBadge
                            sport={request.sport}
                            format={request.matchFormat}
                          />
                          {displayStatus === "scheduling" && (
                            <span className="flex items-center gap-1.5 rounded-full bg-blue-500/10 px-2.5 py-1 text-xs font-medium text-blue-600">
                              <Loader2 className="h-3 w-3 animate-spin" />
                              Scheduling
                            </span>
                          )}
                          {displayStatus === "matched" && (
                            <span className="flex items-center gap-1.5 rounded-full bg-green-500/10 px-2.5 py-1 text-xs font-medium text-green-600">
                              <CheckCircle className="h-3 w-3" />
                              Matched
                            </span>
                          )}
                          {request.status === "expired" && (
                            <span className="flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground">
                              <XCircle className="h-3 w-3" />
                              No match
                            </span>
                          )}
                          {displayStatus === "cancelled" && (
                            <span className="flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground">
                              <XCircle className="h-3 w-3" />
                              Cancelled
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="mt-3 flex flex-wrap items-center gap-4 text-sm text-foreground">
                        <span className="flex items-center gap-2">
                          <Calendar className="h-4 w-4 text-primary" />
                          {format(new Date(request.date), "EEE, MMM d")}
                        </span>
                        <span className="flex items-center gap-2">
                          <Clock className="h-4 w-4 text-primary" />
                          {request.time}
                        </span>
                        <span className="flex items-center gap-2">
                          <MapPin className="h-4 w-4 text-primary" />
                          {request.location}
                        </span>
                        {displayStatus === "scheduling" && (
                          <span className="flex items-center gap-2 rounded-full bg-muted/60 px-2 py-0.5 text-xs text-muted-foreground">
                            <Hourglass className="h-3.5 w-3.5" />
                            Reply within {formatResponseWindow(request.responseWindowMinutes)}
                          </span>
                        )}
                      </div>

                      <div className="mt-4 border-t border-border/30 pt-4">
                        <p className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                          Invite Progress
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
                                {contact.status === "contacted" && (
                                  <Loader2
                                    className="h-3.5 w-3.5 text-blue-600 animate-spin"
                                  />
                                )}
                                {contact.status === "pending" && (
                                  <span className="text-[10px] font-bold text-muted-foreground">
                                    {idx + 1}
                                  </span>
                                )}
                              </span>
                              <span
                                className={`flex-1 ${contact.status === "declined" || contact.status === "no_response" || contact.status === "cancelled" ? "text-muted-foreground line-through" : "text-foreground"}`}
                              >
                                {contact.name}
                              </span>
                              {contact.status === "contacted" &&
                                contact.contactedAt &&
                                request.status === "scheduling" && (
                                  <TimeLeftBadge
                                    contactedAt={contact.contactedAt}
                                    responseWindowMinutes={request.responseWindowMinutes}
                                  />
                                )}
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
                                    title="Accept"
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
                                    title="Remove from queue"
                                    className="rounded p-1 text-muted-foreground transition-colors hover:bg-background hover:text-destructive"
                                  >
                                    <Trash2 className="h-3 w-3" />
                                  </button>
                                )}
                              {request.status !== "matched" &&
                                request.status !== "cancelled" &&
                                (contact.status === "no_response" || contact.status === "cancelled") && (
                                  <button
                                    onClick={() => handleRetryContact(request.id, contact.id)}
                                    title="Retry invite"
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
                                    title="Cancel"
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
                                    title="Cancel acceptance"
                                    className="rounded p-1 text-muted-foreground transition-colors hover:bg-background hover:text-destructive"
                                  >
                                    <XCircle className="h-3 w-3" />
                                  </button>
                                )}
                            </div>
                          ))}
                        </div>
                      </div>

                      {displayStatus === "expired" && (
                        <div className="mt-4 rounded-xl border border-dashed border-muted-foreground/30 bg-muted/20 px-4 py-3">
                          <p className="text-sm text-muted-foreground">
                            {request.matchFormat === "doubles"
                              ? "Not enough contacts responded in time. Add more contacts or start a new request."
                              : "No one responded in time. Add more contacts or start a new request."}
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
                              New request
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
                                variant="outline"
                                size="sm"
                                className="gap-1.5"
                                onClick={() => handleCopyRequestLink(request)}
                              >
                                {copiedRequestId === request.id ? (
                                  <>
                                    <Check className="h-3.5 w-3.5" />
                                    Copied
                                  </>
                                ) : (
                                  <>
                                    <Copy className="h-3.5 w-3.5" />
                                    Copy Link
                                  </>
                                )}
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                className="gap-1.5 text-[#25D366] hover:border-[#25D366]/40 hover:bg-[#25D366]/10 hover:text-[#25D366]"
                                onClick={() => handleShareWhatsApp(request)}
                              >
                                <Link2 className="h-3.5 w-3.5" />
                                WhatsApp
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="gap-1.5 text-destructive hover:bg-destructive/10 hover:text-destructive"
                                onClick={() => handleCancelRequest(request.id)}
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                                Cancel
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
                                Go to match
                              </Link>
                            </Button>
                          )}
                          {request.whatsappGroupId ? (
                            <Button
                              size="sm"
                              className="gap-1.5 bg-[#25D366] text-white hover:bg-[#25D366]/90"
                              asChild
                            >
                              <a
                                href={`https://chat.whatsapp.com/${request.whatsappGroupId}`}
                                target="_blank"
                                rel="noopener noreferrer"
                              >
                                <CheckCircle className="h-3.5 w-3.5" />
                                Open WhatsApp Group
                              </a>
                            </Button>
                          ) : (
                            <Button
                              size="sm"
                              className="gap-1.5 bg-[#25D366] text-white hover:bg-[#25D366]/90"
                              disabled
                              title="WhatsApp group link not available"
                            >
                              <CheckCircle className="h-3.5 w-3.5" />
                              Open WhatsApp Group
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
    <div className="flex items-center gap-3">
      <span className="text-sm text-muted-foreground">
        <span
          className={
            atCapacity ? "font-semibold text-destructive" : "font-semibold text-foreground"
          }
        >
          {activeRequestCount}
        </span>
        <span> / {MAX_ACTIVE_REQUESTS} active</span>
      </span>
      <Button
        size="lg"
        className="gap-2 shadow-lg shadow-primary/20"
        onClick={() => setWizardOpen(true)}
        disabled={atCapacity}
        title={
          atCapacity
            ? `You have reached the limit of ${MAX_ACTIVE_REQUESTS} active scheduling requests`
            : undefined
        }
      >
        <Zap className="h-5 w-5" />
        I Want to Play
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
                  .map(mapSchedulingToInviteRequest)
                  .filter((r): r is InviteRequest => r !== null)
                setInviteRequests(mapped)
              })
              .catch(() => {})
          }}
        />
      )}

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
