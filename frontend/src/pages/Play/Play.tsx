import { useState, useEffect } from "react"
import { format } from "date-fns"
import {
  Calendar,
  Clock,
  MapPin,
  Zap,
  Globe,
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
  SkipForward,
  RotateCcw,
  Link2,
  Copy,
  Check,
  MoreVertical,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { PageHeader } from "@/components/page-header"
import { MatchTypeBadge } from "@/components/match-type-badge"
import { IWantToPlayWizard } from "@/components/i-want-to-play-wizard"
import { toast } from "sonner"
import { getCurrentUserId } from "@/lib/current-user"
import { schedulingService } from "@/lib/services/scheduling.service"
import { invitesService } from "@/lib/services/invites.service"
import { adaptInvite } from "@/lib/api/adapters"
import type { Invite } from "@/lib/types"

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
  status: "scheduling" | "paused" | "matched" | "expired"
  contacts: {
    id: string
    name: string
    status: "pending" | "contacted" | "declined" | "accepted" | "no_response"
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
  if (r.status === "cancelled") return null
  const statusMap = {
    active: "scheduling" as const,
    paused: "paused" as const,
    completed: "matched" as const,
    expired: "expired" as const,
    cancelled: "expired" as const,
  }
  const contactStatusMap = {
    pending: "pending" as const,
    contacted: "contacted" as const,
    waiting_reply: "contacted" as const,
    accepted: "accepted" as const,
    declined: "declined" as const,
    expired: "no_response" as const,
  }
  const dateStr = r.date.slice(0, 10)
  const timeStr = formatTimeRange(r.startTime, r.endTime)
  const candidates = r.candidates ?? []
  const contacts = candidates.map((c) => ({
    id: c.id,
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
    contacts,
    currentIndex: r.currentCandidateIndex,
  }
}

export default function PlayPage() {
  const currentUserId = getCurrentUserId()
  const [wizardOpen, setWizardOpen] = useState(false)
  const [incomingInvitesList, setIncomingInvitesList] = useState<Invite[]>([])
  const [inviteRequests, setInviteRequests] = useState<InviteRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [copiedRequestId, setCopiedRequestId] = useState<string | null>(null)

  async function fetchSchedulingData(isInitial = false) {
    if (isInitial) setLoading(true)
    try {
      const [requestsRes, openInvitesRes] = await Promise.all([
        schedulingService.listByHost(currentUserId),
        invitesService.getOpenInvites().then((list: unknown[]) =>
          (list as import("@/lib/api/adapters").BackendInviteDTO[]).map((d) => adaptInvite(d))
        ).catch(() => []),
      ])
      const mapped = requestsRes
        .map(mapSchedulingToInviteRequest)
        .filter((r): r is InviteRequest => r !== null)
      setInviteRequests(mapped)
      setIncomingInvitesList(openInvitesRes)
      return mapped
    } catch {
      setIncomingInvitesList([])
      return []
    } finally {
      if (isInitial) setLoading(false)
    }
  }

  useEffect(() => {
    let cancelled = false
    fetchSchedulingData(true).catch(() => {})
    return () => { cancelled = true }
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

  const activeRequestCount = inviteRequests.filter(
    (r) => r.status === "scheduling" || r.status === "paused"
  ).length
  const atCapacity = activeRequestCount >= MAX_ACTIVE_REQUESTS

  const incomingInvites = incomingInvitesList.filter(
    (i) => i.status === "pending" && i.fromUserId !== currentUserId
  )

  async function handleAcceptInvite(token: string) {
    try {
      await invitesService.accept(token, currentUserId)
      setIncomingInvitesList((prev) =>
        prev.map((i) => (i.token === token ? { ...i, status: "accepted" as const } : i))
      )
      toast.success("Invite accepted!")
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to accept invite")
    }
  }

  async function handleDeclineInvite(token: string) {
    try {
      await invitesService.decline(token)
      setIncomingInvitesList((prev) =>
        prev.map((i) => (i.token === token ? { ...i, status: "declined" as const } : i))
      )
      toast.success("Invite declined")
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to decline invite")
    }
  }

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
      await schedulingService.cancel(id, currentUserId)
      setInviteRequests((prev) => prev.filter((r) => r.id !== id))
      toast.success("Invite request cancelled")
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to cancel request")
    }
  }

  function handleSkipContact(_requestId: string, contactName: string) {
    toast.info(`Skipping is done via the scheduling flow for ${contactName}`)
  }

  async function handleRetryContact(requestId: string, candidateId: string) {
    try {
      const updated = await schedulingService.retry(requestId, candidateId, currentUserId)
      const mapped = mapSchedulingToInviteRequest(updated)
      if (mapped) {
        setInviteRequests((prev) =>
          prev.map((r) => (r.id === requestId ? mapped : r))
        )
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
        <Tabs defaultValue="requests" className="w-full">
          <TabsList className="w-full max-w-md">
            <TabsTrigger value="requests" className="flex-1 text-base">
              My Requests
            </TabsTrigger>
            <TabsTrigger value="incoming" className="flex-1 text-base">
              Incoming Invites
            </TabsTrigger>
          </TabsList>

          {/* My Requests Tab - Shows active invite scheduling */}
          <TabsContent value="requests" className="mt-6">
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
            {inviteRequests.length === 0 ? (
              <Card>
                <CardContent className="flex flex-col items-center justify-center py-20">
                  <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-muted">
                    <CirclePlay className="h-8 w-8 text-muted-foreground" />
                  </div>
                  <p className="mt-4 text-lg font-medium text-foreground">No active requests</p>
                  <p className="mt-1 text-base text-muted-foreground">
                    Tap "I Want to Play" to find a match
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
                {inviteRequests.map((request) => (
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
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-muted-foreground"
                        >
                          <MoreVertical className="h-4 w-4" />
                        </Button>
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
                                {contact.status === "no_response" && <Hourglass className="h-3.5 w-3.5 text-muted-foreground" />}
                                {contact.status === "contacted" && <Loader2 className={`h-3.5 w-3.5 text-blue-600 ${request.status === "paused" ? "" : "animate-spin"}`} />}
                                {contact.status === "pending" && <span className="text-[10px] font-bold text-muted-foreground">{idx + 1}</span>}
                              </span>
                              {/* Name */}
                              <span className={`flex-1 ${contact.status === "declined" || contact.status === "no_response" ? "text-muted-foreground line-through" : "text-foreground"}`}>
                                {contact.name}
                              </span>
                              {/* Per-contact actions */}
                              {request.status !== "matched" && (contact.status === "contacted" || contact.status === "declined" || contact.status === "no_response") && (
                                <button
                                  onClick={() => handleRetryContact(request.id, contact.id)}
                                  title="Retry invite"
                                  className="rounded p-1 text-muted-foreground transition-colors hover:bg-background hover:text-foreground"
                                >
                                  <RotateCcw className="h-3 w-3" />
                                </button>
                              )}
                              {request.status !== "matched" && contact.status === "contacted" && (
                                <button
                                  onClick={() => handleSkipContact(request.id, contact.name)}
                                  title="Skip to next"
                                  className="rounded p-1 text-muted-foreground transition-colors hover:bg-background hover:text-foreground"
                                >
                                  <SkipForward className="h-3 w-3" />
                                </button>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Actions */}
                      {request.status === "expired" && (
                        <div className="mt-4 rounded-xl border border-dashed border-muted-foreground/30 bg-muted/20 px-4 py-3">
                          <p className="text-sm text-muted-foreground">No one responded in time. Start a new request to try again.</p>
                          <div className="mt-3 flex gap-2">
                            <Button size="sm" onClick={() => setWizardOpen(true)}>
                              <Zap className="mr-1.5 h-3.5 w-3.5" />
                              New request
                            </Button>
                            <Button variant="outline" size="sm" className="text-destructive hover:bg-destructive/10 hover:text-destructive" onClick={() => handleCancelRequest(request.id)}>
                              Remove
                            </Button>
                          </div>
                        </div>
                      )}
                      {request.status !== "matched" && request.status !== "expired" && (
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
                          <Button size="sm" className="gap-1.5 bg-[#25D366] text-white hover:bg-[#25D366]/90">
                            <CheckCircle className="h-3.5 w-3.5" />
                            Open WhatsApp Group
                          </Button>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
              </>
            )}
          </TabsContent>

          {/* Incoming Invites Tab */}
          <TabsContent value="incoming" className="mt-6">
            {loading ? (
              <Card>
                <CardContent className="flex items-center justify-center py-20">
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </CardContent>
              </Card>
            ) : incomingInvites.length === 0 ? (
              <Card>
                <CardContent className="flex flex-col items-center justify-center py-20">
                  <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-muted">
                    <Globe className="h-8 w-8 text-muted-foreground" />
                  </div>
                  <p className="mt-4 text-lg font-medium text-foreground">
                    No incoming invites
                  </p>
                  <p className="mt-1 text-base text-muted-foreground">
                    When someone invites you to play, it will appear here
                  </p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-4">
                {incomingInvites.map((invite) => (
                  <Card key={invite.id}>
                    <CardContent className="flex items-center justify-between p-5">
                      <div className="flex-1">
                        <div className="flex items-center gap-3">
                          <div className="flex h-11 w-11 items-center justify-center rounded-full bg-primary/10 text-base font-bold text-primary">
                            {invite.fromPlayerName.split(" ").map((n) => n[0]).join("")}
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <p className="text-base font-semibold text-foreground">
                                {invite.fromPlayerName}
                              </p>
                              <MatchTypeBadge type={invite.matchType} />
                              {invite.isOpen && (
                                <span className="flex items-center gap-1 rounded-lg bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                                  <Globe className="h-3 w-3" /> Open
                                </span>
                              )}
                            </div>
                            <div className="mt-1.5 flex items-center gap-4 text-sm text-muted-foreground">
                              <span className="flex items-center gap-1.5">
                                <Calendar className="h-4 w-4" />
                                {format(new Date(invite.date), "MMM d")}
                              </span>
                              <span className="flex items-center gap-1.5">
                                <Clock className="h-4 w-4" />
                                {invite.time}
                              </span>
                              <span className="flex items-center gap-1.5">
                                <MapPin className="h-4 w-4" />
                                {invite.location}
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <Button
                          className="gap-1.5"
                          onClick={() => handleAcceptInvite(invite.token)}
                        >
                          <CheckCircle className="h-4 w-4" />
                          Accept
                        </Button>
                        <Button
                          variant="outline"
                          className="gap-1.5"
                          onClick={() => handleDeclineInvite(invite.token)}
                        >
                          <XCircle className="h-4 w-4" />
                          Decline
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
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
    </>
  )
}
