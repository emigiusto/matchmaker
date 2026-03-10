import { useState } from "react"
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
// TODO: wire to API — replace with schedulingService, invitesService
import {
  mockInvites,
  CURRENT_USER_ID,
} from "@/lib/mock-data"

// Mock invite requests with sequential invite progress
interface InviteRequest {
  id: string
  date: string
  time: string
  location: string
  matchType: "competitive" | "practice"
  sport: "tennis" | "padel"
  matchFormat: "singles" | "doubles"
  status: "scheduling" | "paused" | "matched" | "expired"
  contacts: {
    name: string
    status: "pending" | "contacted" | "declined" | "accepted" | "no_response"
  }[]
  currentIndex: number
}

const MAX_ACTIVE_REQUESTS = 3

const mockInviteRequests: InviteRequest[] = [
  {
    id: "req-1",
    date: "2026-03-12",
    time: "18:00 - 19:30",
    location: "Barcelona (10 km)",
    matchType: "competitive",
    sport: "tennis",
    matchFormat: "singles",
    status: "scheduling",
    contacts: [
      { name: "Carlos", status: "declined" },
      { name: "Pablo", status: "no_response" },
      { name: "Marc", status: "contacted" },
      { name: "Luis", status: "pending" },
      { name: "Ana", status: "pending" },
    ],
    currentIndex: 2,
  },
  {
    id: "req-4",
    date: "2026-03-13",
    time: "20:00 - 21:30",
    location: "Padel Club Diagonal",
    matchType: "competitive",
    sport: "padel",
    matchFormat: "doubles",
    status: "scheduling",
    contacts: [
      { name: "Jordi", status: "declined" },
      { name: "Laia", status: "accepted" },
      { name: "Sergi", status: "contacted" },
      { name: "Neus", status: "contacted" },
      { name: "Toni", status: "pending" },
    ],
    currentIndex: 2,
  },
  {
    id: "req-2",
    date: "2026-03-14",
    time: "10:00 - 11:30",
    location: "Club Tennis Barcino",
    matchType: "practice",
    sport: "tennis",
    matchFormat: "singles",
    status: "matched",
    contacts: [
      { name: "Sofia", status: "accepted" },
      { name: "Jorge", status: "pending" },
    ],
    currentIndex: 0,
  },
]

export default function PlayPage() {
  const [wizardOpen, setWizardOpen] = useState(false)
  const [invites, setInvites] = useState(mockInvites)
  const [inviteRequests, setInviteRequests] = useState(mockInviteRequests)

  const activeRequestCount = inviteRequests.filter(
    (r) => r.status === "scheduling" || r.status === "paused"
  ).length
  const atCapacity = activeRequestCount >= MAX_ACTIVE_REQUESTS

  const incomingInvites = invites.filter(
    (i) =>
      i.status === "pending" &&
      (i.toUserId === CURRENT_USER_ID || i.isOpen) &&
      i.fromUserId !== CURRENT_USER_ID
  )

  function handleAcceptInvite(token: string) {
    setInvites((prev) =>
      prev.map((i) => (i.token === token ? { ...i, status: "accepted" as const } : i))
    )
    toast.success("Invite accepted!")
  }

  function handleDeclineInvite(token: string) {
    setInvites((prev) =>
      prev.map((i) => (i.token === token ? { ...i, status: "declined" as const } : i))
    )
    toast.success("Invite declined")
  }

  function handlePauseRequest(id: string) {
    setInviteRequests((prev) =>
      prev.map((r) =>
        r.id === id
          ? { ...r, status: r.status === "paused" ? "scheduling" : "paused" }
          : r
      )
    )
    toast.success("Invite request updated")
  }

  function handleCancelRequest(id: string) {
    setInviteRequests((prev) => prev.filter((r) => r.id !== id))
    toast.success("Invite request cancelled")
  }

  function handleSkipContact(requestId: string, contactName: string) {
    setInviteRequests((prev) =>
      prev.map((r) => {
        if (r.id !== requestId) return r
        const skippedIdx = r.contacts.findIndex((c) => c.name === contactName)
        const nextIdx = skippedIdx + 1
        return {
          ...r,
          currentIndex: nextIdx < r.contacts.length ? nextIdx : r.currentIndex,
          contacts: r.contacts.map((c, i) => {
            if (c.name === contactName) return { ...c, status: "no_response" as const }
            if (i === nextIdx) return { ...c, status: "contacted" as const }
            return c
          }),
        }
      })
    )
    toast.success(`Skipped ${contactName}, contacting next person`)
  }

  function handleRetryContact(requestId: string, contactName: string) {
    setInviteRequests((prev) =>
      prev.map((r) =>
        r.id === requestId
          ? {
              ...r,
              contacts: r.contacts.map((c) =>
                c.name === contactName ? { ...c, status: "contacted" as const } : c
              ),
            }
          : r
      )
    )
    toast.success(`Re-sending invite to ${contactName}`)
  }

  function handleShareWhatsApp(requestId: string) {
    const request = inviteRequests.find((r) => r.id === requestId)
    if (!request) return
    const message = encodeURIComponent(
      `Want to play tennis on ${format(new Date(request.date), "EEE, MMM d")} (${request.time}) at ${request.location}? Accept my invite here:\n\n${window.location.origin}/invite/tok-${requestId}`
    )
    window.open(`https://wa.me/?text=${message}`, "_blank")
  }

  const [copiedRequestId, setCopiedRequestId] = useState<string | null>(null)

  function handleCopyRequestLink(id: string) {
    navigator.clipboard.writeText(`${window.location.origin}/invite/tok-${id}`)
    setCopiedRequestId(id)
    toast.success("Invite link copied")
    setTimeout(() => setCopiedRequestId(null), 2000)
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
                              key={contact.name}
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
                                  onClick={() => handleRetryContact(request.id, contact.name)}
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
                      {request.status !== "matched" && (
                        <div className="mt-4 space-y-3 border-t border-border/30 pt-4">
                          <div className="flex items-center gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              className="gap-1.5"
                              onClick={() => handlePauseRequest(request.id)}
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
                              onClick={() => handleCopyRequestLink(request.id)}
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
                              onClick={() => handleShareWhatsApp(request.id)}
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
          </TabsContent>

          {/* Incoming Invites Tab */}
          <TabsContent value="incoming" className="mt-6">
            {incomingInvites.length === 0 ? (
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

      <IWantToPlayWizard open={wizardOpen} onOpenChange={setWizardOpen} />
    </>
  )
}
