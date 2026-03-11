import { useState, useEffect } from "react"
import { format } from "date-fns"
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
  Pause,
  Play,
  RotateCcw,
  Link2,
  Copy,
  Check,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { PageHeader } from "@/components/page-header"
import { MatchTypeBadge } from "@/components/match-type-badge"
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
import { getCurrentUserId } from "@/lib/current-user"
import { schedulingService } from "@/lib/services/scheduling.service"
// UI shape for scheduling request (mapped from API)
interface InviteRequest {
  id: string
  inviteToken: string
  date: string
  time: string
  location: string
  matchType: "competitive" | "practice"
  sport: "tennis" | "padel"
  matchFormat: "singles" | "doubles"
  status: "scheduling" | "paused" | "matched" | "expired" | "cancelled"
  whatsappGroupId: string | null
  contacts: {
    id: string
    contactUserId: string
    name: string
    status: "pending" | "contacted" | "declined" | "accepted" | "no_response" | "cancelled"
  }[]
  currentIndex: number
}

const MAX_ACTIVE_REQUESTS = 3
const SCHEDULING_POLL_INTERVAL_MS = 5000 // refetch every 5s when there are active requests

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
    paused: "paused" as const,
    completed: "matched" as const,
    expired: "expired" as const,
    cancelled: "cancelled" as const,
  }
  const contactStatusMap = {
    pending: "pending" as const,
    contacted: "contacted" as const,
    waiting_reply: "contacted" as const,
    accepted: "accepted" as const,
    declined: "declined" as const,  // invitee said no (rejected)
    expired: "no_response" as const,
    cancelled: "cancelled" as const,  // host cancelled
  }
  const dateStr = r.date.slice(0, 10)
  const timeStr = formatTimeRange(r.startTime, r.endTime)
  const candidates = r.candidates ?? []
  const contacts = candidates.map((c) => ({
    id: c.id,
    contactUserId: c.contactUserId,
    name: c.contactUserName ?? "Unknown",
    status: contactStatusMap[c.status] ?? "pending",
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
    whatsappGroupId: r.whatsappGroupId ?? null,
    contacts,
    currentIndex: r.currentCandidateIndex,
  }
}

export default function PlayPage() {
  const currentUserId = getCurrentUserId()
  const [wizardOpen, setWizardOpen] = useState(false)
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

  // Poll for updates when there are active scheduling requests (candidates expiring, etc.)
  useEffect(() => {
    const hasActive = inviteRequests.some(
      (r) => r.status === "scheduling" || r.status === "paused"
    )
    if (!hasActive) return
    const interval = setInterval(() => {
      fetchSchedulingData(false)
    }, SCHEDULING_POLL_INTERVAL_MS)
    return () => clearInterval(interval)
  }, [inviteRequests, currentUserId])

  const filteredRequests = inviteRequests.filter((r) => {
    if (inviteFilter === "all") return r.status !== "cancelled"
    if (inviteFilter === "scheduling") return r.status === "scheduling" || r.status === "paused"
    if (inviteFilter === "no_match") return r.status === "expired"
    if (inviteFilter === "completed") return r.status === "matched"
    if (inviteFilter === "cancelled") return r.status === "cancelled"
    return true
  })

  function switchToFilterForStatus(status: InviteRequest["status"], forceSwitch = false) {
    if (inviteFilter === "all" && !forceSwitch) return
    if (status === "scheduling" || status === "paused") setInviteFilter("scheduling")
    else if (status === "expired") setInviteFilter("no_match")
    else if (status === "cancelled") setInviteFilter("cancelled")
    else if (status === "matched") setInviteFilter("completed")
  }

  const activeRequestCount = inviteRequests.filter(
    (r) => r.status === "scheduling" || r.status === "paused"
  ).length
  const atCapacity = activeRequestCount >= MAX_ACTIVE_REQUESTS

  async function handlePauseRequest(id: string) {
    try {
      const updated = await schedulingService.pause(id, currentUserId)
      const mapped = mapSchedulingToInviteRequest(updated)
      if (mapped) {
        setInviteRequests((prev) =>
          prev.map((r) => (r.id === id ? mapped : r))
        )
        toast.success("Invite request updated")
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to update request")
    }
  }

  async function handleResumeRequest(id: string) {
    try {
      const updated = await schedulingService.resume(id, currentUserId)
      const mapped = mapSchedulingToInviteRequest(updated)
      if (mapped) {
        setInviteRequests((prev) =>
          prev.map((r) => (r.id === id ? mapped : r))
        )
        toast.success("Invite request resumed")
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to resume request")
    }
  }

  async function handleCancelRequest(id: string) {
    try {
      const updated = await schedulingService.cancel(id, currentUserId)
      const mapped = mapSchedulingToInviteRequest(updated)
      if (mapped) {
        setInviteRequests((prev) =>
          prev.map((r) => (r.id === id ? mapped : r))
        )
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
        setInviteRequests((prev) =>
          prev.map((r) => (r.id === requestId ? mapped : r))
        )
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
        setInviteRequests((prev) =>
          prev.map((r) => (r.id === requestId ? mapped : r))
        )
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
        setInviteRequests((prev) =>
          prev.map((r) => (r.id === requestId ? mapped : r))
        )
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
        setInviteRequests((prev) =>
          prev.map((r) => (r.id === requestId ? mapped : r))
        )
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
        setInviteRequests((prev) =>
          prev.map((r) => (r.id === requestId ? mapped : r))
        )
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
      const link = await schedulingService.getInviteLink(
        request.id,
        window.location.origin
      )
      const fullUrl = link.startsWith("http") ? link : `${window.location.origin}${link}`
      await navigator.clipboard.writeText(fullUrl)
      setCopiedRequestId(request.id)
      toast.success("Invite link copied")
      setTimeout(() => setCopiedRequestId(null), 2000)
    } catch (e) {
      const fallback = `${window.location.origin}/play?invite=${request.inviteToken}`
      await navigator.clipboard.writeText(fallback)
      setCopiedRequestId(request.id)
      toast.success("Invite link copied")
      setTimeout(() => setCopiedRequestId(null), 2000)
    }
  }

  return (
    <>
      <PageHeader title="My Invites" description="Create matches and browse open invites">
        <div className="flex items-center gap-3">
          <span className="text-sm text-muted-foreground">
            <span className={atCapacity ? "font-semibold text-destructive" : "font-semibold text-foreground"}>
              {activeRequestCount}
            </span>
            <span> / {MAX_ACTIVE_REQUESTS} active</span>
          </span>
          <Button
            size="lg"
            className="gap-2 shadow-lg shadow-primary/20"
            onClick={() => setWizardOpen(true)}
            disabled={atCapacity}
            title={atCapacity ? "You have reached the limit of 3 active scheduling requests" : undefined}
          >
            <Zap className="h-5 w-5" />
            I Want to Play
          </Button>
        </div>
      </PageHeader>

      <div className="flex flex-1 flex-col gap-6 p-5 lg:p-8">
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
                You have reached the limit of {MAX_ACTIVE_REQUESTS} active scheduling requests. Cancel or finish one to start a new one.
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
                    {inviteRequests.length === 0 ? "Tap \"I Want to Play\" to create your first invite" : "Try another filter"}
                  </p>
                  <Button
                    size="lg"
                    className="mt-6 gap-2"
                    onClick={() => setWizardOpen(true)}
                  >
                    <Zap className="h-5 w-5" />
                    I Want to Play
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-4">
                {filteredRequests.map((request) => (
                  <Card key={request.id}>
                    <CardContent className="p-5">
                      {/* Header with status */}
                      <div className="flex items-start justify-between">
                        <div className="flex flex-wrap items-center gap-2">
                          <MatchTypeBadge type={request.matchType} />
                          <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-medium capitalize text-foreground">
                            {request.sport}
                          </span>
                          <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-medium capitalize text-muted-foreground">
                            {request.matchFormat}
                          </span>
                          {request.status === "scheduling" && (
                            <span className="flex items-center gap-1.5 rounded-full bg-blue-500/10 px-2.5 py-1 text-xs font-medium text-blue-600">
                              <Loader2 className="h-3 w-3 animate-spin" />
                              Scheduling
                            </span>
                          )}
                          {request.status === "paused" && (
                            <span className="flex items-center gap-1.5 rounded-full bg-amber-500/10 px-2.5 py-1 text-xs font-medium text-amber-600">
                              <Pause className="h-3 w-3" />
                              Paused
                            </span>
                          )}
                          {request.status === "matched" && (
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
                          {request.status === "cancelled" && (
                            <span className="flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground">
                              <XCircle className="h-3 w-3" />
                              Cancelled
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Match details */}
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
                      </div>

                      {/* Invite sequence progress */}
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
                              {/* Status icon */}
                              <span className="flex h-4 w-4 shrink-0 items-center justify-center">
                                {contact.status === "accepted" && <UserCheck className="h-3.5 w-3.5 text-green-600" />}
                                {contact.status === "declined" && <UserX className="h-3.5 w-3.5 text-red-500" />}
                                {contact.status === "cancelled" && <XCircle className="h-3.5 w-3.5 text-amber-600" />}
                                {contact.status === "no_response" && <Hourglass className="h-3.5 w-3.5 text-muted-foreground" />}
                                {contact.status === "contacted" && <Loader2 className={`h-3.5 w-3.5 text-blue-600 ${request.status === "paused" ? "" : "animate-spin"}`} />}
                                {contact.status === "pending" && <span className="text-[10px] font-bold text-muted-foreground">{idx + 1}</span>}
                              </span>
                              {/* Name */}
                              <span className={`flex-1 ${contact.status === "declined" || contact.status === "no_response" || contact.status === "cancelled" ? "text-muted-foreground line-through" : "text-foreground"}`}>
                                {contact.name}
                              </span>
                              {/* Per-contact actions */}
                              {request.status !== "matched" && request.status !== "cancelled" && (contact.status === "pending" || contact.status === "contacted" || contact.status === "no_response" || contact.status === "cancelled") && (
                                <button
                                  onClick={() => setAcceptConfirm({ requestId: request.id, candidateId: contact.id, contactName: contact.name })}
                                  title="Accept"
                                  className="rounded p-1 text-green-600 transition-colors hover:bg-green-500/10 hover:text-green-700"
                                >
                                  <UserCheck className="h-3 w-3" />
                                </button>
                              )}
                              {request.status !== "matched" && request.status !== "cancelled" && contact.status === "pending" && (
                                <button
                                  onClick={() => handleRemoveContact(request.id, contact.id)}
                                  title="Remove from queue"
                                  className="rounded p-1 text-muted-foreground transition-colors hover:bg-background hover:text-destructive"
                                >
                                  <Trash2 className="h-3 w-3" />
                                </button>
                              )}
                              {request.status !== "matched" && request.status !== "cancelled" && (contact.status === "no_response" || contact.status === "cancelled") && (
                                <button
                                  onClick={() => handleRetryContact(request.id, contact.id)}
                                  title="Retry invite"
                                  className="rounded p-1 text-muted-foreground transition-colors hover:bg-background hover:text-foreground"
                                >
                                  <RotateCcw className="h-3 w-3" />
                                </button>
                              )}
                              {request.status !== "matched" && request.status !== "cancelled" && contact.status === "contacted" && (
                                <button
                                  onClick={() => handleCancelContact(request.id, contact.id)}
                                  title="Cancel"
                                  className="rounded p-1 text-muted-foreground transition-colors hover:bg-background hover:text-foreground"
                                >
                                  <XCircle className="h-3 w-3" />
                                </button>
                              )}
                              {(request.status === "matched" || request.status === "scheduling" || request.status === "paused" || request.status === "expired") && contact.status === "accepted" && (
                                <button
                                  onClick={() => handleCancelAccepted(request.id, contact.id)}
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

                      {/* Actions */}
                      {request.status === "expired" && (
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
                      {request.status !== "matched" && request.status !== "expired" && request.status !== "cancelled" && (
                        <div className="mt-4 space-y-3 border-t border-border/30 pt-4">
                          <div className="flex items-center gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              className="gap-1.5"
                              onClick={() =>
                                request.status === "paused"
                                  ? handleResumeRequest(request.id)
                                  : handlePauseRequest(request.id)
                              }
                            >
                              {request.status === "paused" ? (
                                <>
                                  <Play className="h-3.5 w-3.5" />
                                  Resume
                                </>
                              ) : (
                                <>
                                  <Pause className="h-3.5 w-3.5" />
                                  Pause
                                </>
                              )}
                            </Button>
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
                                <><Check className="h-3.5 w-3.5" />Copied</>
                              ) : (
                                <><Copy className="h-3.5 w-3.5" />Copy Link</>
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
                        <div className="mt-4">
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
                ))}
              </div>
            )}
              </>
            )}
      </div>

      <IWantToPlayWizard
        open={wizardOpen}
        onOpenChange={setWizardOpen}
        hostUserId={currentUserId}
        onSuccess={() => {
          schedulingService.listByHost(currentUserId).then((requestsRes) => {
            const mapped = requestsRes
              .map(mapSchedulingToInviteRequest)
              .filter((r): r is InviteRequest => r !== null)
            setInviteRequests(mapped)
          }).catch(() => {})
        }}
      />

      <AlertDialog open={!!acceptConfirm} onOpenChange={(open) => !open && setAcceptConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Accept candidate</AlertDialogTitle>
            <AlertDialogDescription>
              Accept {acceptConfirm?.contactName ?? "this person"} for this match? This will mark them as confirmed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => acceptConfirm && handleManualAccept(acceptConfirm.requestId, acceptConfirm.candidateId)}
            >
              Accept
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
