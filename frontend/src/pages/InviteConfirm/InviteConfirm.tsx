import { useState, useEffect } from "react"
import { Link, useParams } from "react-router-dom"
import { format } from "date-fns"
import {
  Calendar,
  Clock,
  MapPin,
  CheckCircle,
  XCircle,
  Users,
  Trophy,
  TrendingUp,
  BarChart3,
  ArrowRight,
  Sparkles,
  Shield,
  Zap,
  LogIn,
  UserPlus,
  User,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { toast } from "sonner"
import { invitesService } from "@/lib/services/invites.service"
import { adaptInvite } from "@/lib/api/adapters"
import { getCurrentUserId } from "@/lib/current-user"
import type { Invite } from "@/lib/types"

const mockInviteData: Invite & { message?: string; fromPlayerLevel?: number; fromPlayerCity?: string; fromPlayerMatches?: number; fromPlayerWins?: number } = {
  id: "invite-ext-001",
  token: "tok-avail-001",
  fromUserId: "user-002",
  fromPlayerName: "Maria Santos",
  fromPlayerLevel: 5.0,
  fromPlayerCity: "Barcelona",
  fromPlayerMatches: 35,
  fromPlayerWins: 20,
  availabilityId: "avail-001",
  matchType: "competitive",
  date: "2026-02-25",
  time: "18:00",
  location: "Club Tennis Barcelona",
  status: "pending",
  isOpen: false,
  createdAt: new Date().toISOString(),
  message: "Hey! Want to play a competitive match next Tuesday? I reserved a clay court at Club Tennis Barcelona.",
}

function TennisBallIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="1.5" />
      <path
        d="M6 3.5C9.5 6 9.5 18 6 20.5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <path
        d="M18 3.5C14.5 6 14.5 18 18 20.5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  )
}

type FlowState = "invite" | "responding" | "accepted" | "declined"

export default function InviteLandingPage() {
  const { token } = useParams<{ token: string }>()
  const currentUserId = getCurrentUserId()
  const [invite, setInvite] = useState<(Invite & { message?: string; fromPlayerLevel?: number; fromPlayerCity?: string; fromPlayerMatches?: number; fromPlayerWins?: number }) | null>(null)
  const [loading, setLoading] = useState(true)
  const [flowState, setFlowState] = useState<FlowState>("invite")

  useEffect(() => {
    if (!token) {
      setInvite(mockInviteData)
      setLoading(false)
      return
    }
    invitesService.getByToken(token)
      .then((res) => setInvite({ ...adaptInvite(res as unknown as import("@/lib/api/adapters").BackendInviteDTO), message: (res as { message?: string }).message }))
      .catch(() => setInvite(mockInviteData))
      .finally(() => setLoading(false))
  }, [token])

  const displayInvite = invite ?? mockInviteData

  // Guest form state
  const [guestFirstName, setGuestFirstName] = useState("")
  const [guestLastName, setGuestLastName] = useState("")
  const [guestEmail, setGuestEmail] = useState("")

  // Login form state
  const [loginEmail, setLoginEmail] = useState("")
  const [loginPassword, setLoginPassword] = useState("")

  // Signup form state
  const [signupName, setSignupName] = useState("")
  const [signupEmail, setSignupEmail] = useState("")
  const [signupPassword, setSignupPassword] = useState("")

  const isGuestValid = guestFirstName.trim().length > 0 && guestLastName.trim().length > 0

  const handleAcceptClick = () => {
    setFlowState("responding")
  }

  const handleDecline = async () => {
    if (token) {
      try {
        await invitesService.decline(token)
        setFlowState("declined")
        toast("Invite declined. You can always join later.")
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Failed to decline")
      }
    } else {
      setFlowState("declined")
      toast("Invite declined. You can always join later.")
    }
  }

  const handleGuestAccept = () => {
    if (!isGuestValid) return
    setFlowState("accepted")
    toast.success(
      `Invite accepted as ${guestFirstName} ${guestLastName}! ${displayInvite.fromPlayerName} will be notified.`
    )
  }

  const handleLoginAccept = async (e: React.FormEvent) => {
    e.preventDefault()
    if (token) {
      try {
        await invitesService.accept(token, currentUserId)
        setFlowState("accepted")
        toast.success("Logged in and invite accepted!")
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Failed to accept")
      }
    } else {
      setFlowState("accepted")
      toast.success("Logged in and invite accepted!")
    }
  }

  const handleSignupAccept = async (e: React.FormEvent) => {
    e.preventDefault()
    if (token) {
      try {
        await invitesService.accept(token, currentUserId)
        setFlowState("accepted")
        toast.success("Account created and invite accepted! Welcome to MatchMaker.")
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Failed to accept")
      }
    } else {
      setFlowState("accepted")
      toast.success("Account created and invite accepted! Welcome to MatchMaker.")
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <p className="text-muted-foreground">Loading invite...</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Top bar */}
      <header className="border-b border-border/40 bg-card/80 backdrop-blur-sm">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-5 py-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary">
              <TennisBallIcon className="h-5 w-5 text-primary-foreground" />
            </div>
            <span className="text-lg font-bold tracking-tight text-foreground">
              MatchMaker
            </span>
          </div>
          <Button variant="outline" size="sm" className="hidden gap-1.5 sm:flex" asChild>
            <Link to="/dashboard">
              <LogIn className="h-4 w-4" />
              Log in
            </Link>
          </Button>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-5 py-8 lg:py-12">
        {/* Hero section */}
        <div className="mb-8 text-center lg:mb-12">
          <Badge
            variant="secondary"
            className="mb-4 gap-1.5 rounded-full px-4 py-1.5 text-sm font-medium"
          >
            <TennisBallIcon className="h-3.5 w-3.5" />
            Match Invite
          </Badge>
          <h1 className="mx-auto max-w-xl text-balance text-3xl font-bold tracking-tight text-foreground sm:text-4xl lg:text-5xl">
            {"You've been invited to play"}
          </h1>
          <p className="mx-auto mt-3 max-w-md text-pretty text-base text-muted-foreground lg:text-lg">
            {displayInvite.fromPlayerName} wants to play a{" "}
            {displayInvite.matchType === "competitive" ? "competitive" : "practice"} match with you
          </p>
        </div>

        {/* Main 2-column layout */}
        <div className="grid gap-8 lg:grid-cols-5">
          {/* Left column: Match details card */}
          <div className="lg:col-span-3">
            <Card className="overflow-hidden border-border/40 shadow-lg">
              {/* Inviter profile header */}
              <div className="bg-primary/[0.04] px-6 py-5">
                <div className="flex items-center gap-4">
                  <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                    <span className="text-xl font-bold">
                      {displayInvite.fromPlayerName
                        .split(" ")
                        .map((n) => n[0])
                        .join("")}
                    </span>
                  </div>
                  <div>
                    <h2 className="text-xl font-bold text-foreground">
                      {displayInvite.fromPlayerName}
                    </h2>
                    <div className="mt-0.5 flex items-center gap-3 text-sm text-muted-foreground">
                      <span className="font-mono font-medium text-primary">
                        Level {displayInvite.fromPlayerLevel?.toFixed(1) ?? "—"}
                      </span>
                      <span className="text-border">|</span>
                      <span>{displayInvite.fromPlayerCity ?? "—"}</span>
                      <span className="text-border">|</span>
                      <span>
                        {displayInvite.fromPlayerWins ?? 0}W /{" "}
                        {(displayInvite.fromPlayerMatches ?? 0) - (displayInvite.fromPlayerWins ?? 0)}L
                      </span>
                    </div>
                  </div>
                </div>
                {displayInvite.message && (
                  <div className="mt-4 rounded-xl bg-card/80 p-4 text-sm leading-relaxed italic text-muted-foreground">
                    {'"'}
                    {displayInvite.message}
                    {'"'}
                  </div>
                )}
              </div>

              <CardContent className="p-6">
                {/* Match details grid */}
                <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                  <div className="rounded-xl bg-muted/40 p-4 text-center">
                    <Calendar className="mx-auto mb-2 h-5 w-5 text-primary" />
                    <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                      Date
                    </p>
                    <p className="mt-1 text-base font-bold text-foreground">
                      {format(new Date(displayInvite.date), "MMM d")}
                    </p>
                  </div>
                  <div className="rounded-xl bg-muted/40 p-4 text-center">
                    <Clock className="mx-auto mb-2 h-5 w-5 text-primary" />
                    <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                      Time
                    </p>
                    <p className="mt-1 text-base font-bold text-foreground">{displayInvite.time}</p>
                  </div>
                  <div className="rounded-xl bg-muted/40 p-4 text-center">
                    <MapPin className="mx-auto mb-2 h-5 w-5 text-primary" />
                    <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                      Location
                    </p>
                    <p className="mt-1 text-sm font-bold text-foreground">{displayInvite.location}</p>
                  </div>
                  <div className="rounded-xl bg-muted/40 p-4 text-center">
                    <Trophy className="mx-auto mb-2 h-5 w-5 text-primary" />
                    <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                      Type
                    </p>
                    <p className="mt-1 text-base font-bold capitalize text-foreground">
                      {displayInvite.matchType}
                    </p>
                  </div>
                </div>

                {/* State: Initial -- show Accept / Decline */}
                {flowState === "invite" && (
                  <div className="mt-6 flex gap-3">
                    <Button
                      size="xl"
                      className="flex-1 gap-2 text-base font-semibold"
                      onClick={handleAcceptClick}
                    >
                      <CheckCircle className="h-5 w-5" />
                      Accept Invite
                    </Button>
                    <Button
                      size="xl"
                      variant="outline"
                      className="gap-2 text-base font-semibold text-destructive hover:bg-destructive/5 hover:text-destructive"
                      onClick={handleDecline}
                    >
                      <XCircle className="h-5 w-5" />
                      Decline
                    </Button>
                  </div>
                )}

                {/* State: Responding -- Choose how to accept */}
                {flowState === "responding" && (
                  <div className="mt-6">
                    <div className="mb-4 rounded-2xl border border-primary/20 bg-primary/[0.04] p-4 text-center">
                      <p className="text-base font-semibold text-foreground">
                        Great! How would you like to accept?
                      </p>
                      <p className="mt-1 text-sm text-muted-foreground">
                        Choose one of the options below to confirm your attendance
                      </p>
                    </div>

                    <Tabs defaultValue="guest" className="w-full">
                      <TabsList className="grid w-full grid-cols-3">
                        <TabsTrigger value="guest" className="gap-1.5 text-xs sm:text-sm">
                          <User className="h-3.5 w-3.5" />
                          <span className="hidden sm:inline">Play as</span> Guest
                        </TabsTrigger>
                        <TabsTrigger value="login" className="gap-1.5 text-xs sm:text-sm">
                          <LogIn className="h-3.5 w-3.5" />
                          Log in
                        </TabsTrigger>
                        <TabsTrigger value="signup" className="gap-1.5 text-xs sm:text-sm">
                          <UserPlus className="h-3.5 w-3.5" />
                          Sign up
                        </TabsTrigger>
                      </TabsList>

                      {/* Guest tab */}
                      <TabsContent value="guest" className="mt-4">
                        <div className="flex flex-col gap-4">
                          <p className="text-sm leading-relaxed text-muted-foreground">
                            No account needed. Just tell us your name so {displayInvite.fromPlayerName}{" "}
                            knows who accepted.
                          </p>
                          <div className="grid grid-cols-2 gap-3">
                            <div>
                              <Label htmlFor="guest-first" className="text-sm font-medium">
                                First name <span className="text-destructive">*</span>
                              </Label>
                              <Input
                                id="guest-first"
                                placeholder="First name"
                                className="mt-1.5"
                                value={guestFirstName}
                                onChange={(e) => setGuestFirstName(e.target.value)}
                              />
                            </div>
                            <div>
                              <Label htmlFor="guest-last" className="text-sm font-medium">
                                Last name <span className="text-destructive">*</span>
                              </Label>
                              <Input
                                id="guest-last"
                                placeholder="Last name"
                                className="mt-1.5"
                                value={guestLastName}
                                onChange={(e) => setGuestLastName(e.target.value)}
                              />
                            </div>
                          </div>
                          <div>
                            <Label htmlFor="guest-email" className="text-sm font-medium">
                              Email{" "}
                              <span className="text-xs font-normal text-muted-foreground">
                                (optional, for match updates)
                              </span>
                            </Label>
                            <Input
                              id="guest-email"
                              type="email"
                              placeholder="you@example.com"
                              className="mt-1.5"
                              value={guestEmail}
                              onChange={(e) => setGuestEmail(e.target.value)}
                            />
                          </div>
                          <Button
                            size="lg"
                            className="w-full gap-2 text-base font-semibold"
                            disabled={!isGuestValid}
                            onClick={handleGuestAccept}
                          >
                            <CheckCircle className="h-5 w-5" />
                            Accept as Guest
                          </Button>
                          <p className="text-center text-xs text-muted-foreground">
                            You can create an account later to track your matches and level
                          </p>
                        </div>
                      </TabsContent>

                      {/* Login tab */}
                      <TabsContent value="login" className="mt-4">
                        <form onSubmit={handleLoginAccept} className="flex flex-col gap-4">
                          <p className="text-sm leading-relaxed text-muted-foreground">
                            Already a MatchMaker player? Log in to accept with your profile.
                          </p>
                          <div>
                            <Label htmlFor="login-email" className="text-sm font-medium">
                              Email
                            </Label>
                            <Input
                              id="login-email"
                              type="email"
                              placeholder="you@example.com"
                              className="mt-1.5"
                              required
                              value={loginEmail}
                              onChange={(e) => setLoginEmail(e.target.value)}
                            />
                          </div>
                          <div>
                            <Label htmlFor="login-password" className="text-sm font-medium">
                              Password
                            </Label>
                            <Input
                              id="login-password"
                              type="password"
                              placeholder="Your password"
                              className="mt-1.5"
                              required
                              value={loginPassword}
                              onChange={(e) => setLoginPassword(e.target.value)}
                            />
                          </div>
                          <Button
                            type="submit"
                            size="lg"
                            className="w-full gap-2 text-base font-semibold"
                          >
                            <LogIn className="h-5 w-5" />
                            Log in & Accept
                          </Button>
                          <p className="text-center text-xs text-muted-foreground">
                            <a href="#" className="font-medium text-primary hover:underline">
                              Forgot your password?
                            </a>
                          </p>
                        </form>
                      </TabsContent>

                      {/* Signup tab */}
                      <TabsContent value="signup" className="mt-4">
                        <form onSubmit={handleSignupAccept} className="flex flex-col gap-4">
                          <p className="text-sm leading-relaxed text-muted-foreground">
                            Create your free account to accept this invite and start tracking your
                            tennis journey.
                          </p>
                          <div>
                            <Label htmlFor="signup-name" className="text-sm font-medium">
                              Full name
                            </Label>
                            <Input
                              id="signup-name"
                              placeholder="Your full name"
                              className="mt-1.5"
                              required
                              value={signupName}
                              onChange={(e) => setSignupName(e.target.value)}
                            />
                          </div>
                          <div>
                            <Label htmlFor="signup-email" className="text-sm font-medium">
                              Email
                            </Label>
                            <Input
                              id="signup-email"
                              type="email"
                              placeholder="you@example.com"
                              className="mt-1.5"
                              required
                              value={signupEmail}
                              onChange={(e) => setSignupEmail(e.target.value)}
                            />
                          </div>
                          <div>
                            <Label htmlFor="signup-password" className="text-sm font-medium">
                              Password
                            </Label>
                            <Input
                              id="signup-password"
                              type="password"
                              placeholder="Create a password"
                              className="mt-1.5"
                              required
                              value={signupPassword}
                              onChange={(e) => setSignupPassword(e.target.value)}
                            />
                          </div>
                          <Button
                            type="submit"
                            size="lg"
                            className="w-full gap-2 text-base font-semibold"
                          >
                            <UserPlus className="h-5 w-5" />
                            Create Account & Accept
                          </Button>
                          <p className="text-center text-xs text-muted-foreground">
                            By creating an account you agree to our{" "}
                            <a href="#" className="font-medium text-primary hover:underline">
                              Terms of Service
                            </a>
                          </p>
                        </form>
                      </TabsContent>
                    </Tabs>

                    {/* Back to decline */}
                    <button
                      onClick={handleDecline}
                      className="mt-4 w-full text-center text-sm text-muted-foreground transition-colors hover:text-destructive"
                    >
                      {"I can't make it -- decline invite"}
                    </button>
                  </div>
                )}

                {/* State: Accepted */}
                {flowState === "accepted" && (
                  <div className="mt-6 rounded-2xl border border-primary/20 bg-primary/[0.04] p-6 text-center">
                    <CheckCircle className="mx-auto mb-3 h-10 w-10 text-primary" />
                    <p className="text-xl font-bold text-foreground">{"You're in!"}</p>
                    <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-muted-foreground">
                      {displayInvite.fromPlayerName} will be notified that you accepted. See you on{" "}
                      <span className="font-medium text-foreground">
                        {format(new Date(displayInvite.date), "EEEE, MMM d")}
                      </span>{" "}
                      at{" "}
                      <span className="font-medium text-foreground">{displayInvite.time}</span> at{" "}
                      <span className="font-medium text-foreground">{displayInvite.location}</span>.
                    </p>
                    {guestFirstName && (
                      <div className="mt-5 rounded-xl border border-border/40 bg-card p-4">
                        <p className="text-sm font-medium text-muted-foreground">
                          Want to track your matches and find more opponents?
                        </p>
                        <Button
                          size="lg"
                          className="mt-3 gap-2 text-base font-semibold"
                          onClick={() =>
                            toast.success("Redirecting to sign up...")
                          }
                        >
                          <Sparkles className="h-4 w-4" />
                          Create a Free Account
                          <ArrowRight className="h-4 w-4" />
                        </Button>
                      </div>
                    )}
                  </div>
                )}

                {/* State: Declined */}
                {flowState === "declined" && (
                  <div className="mt-6 rounded-2xl border border-border/40 bg-muted/20 p-6 text-center">
                    <XCircle className="mx-auto mb-3 h-10 w-10 text-muted-foreground" />
                    <p className="text-xl font-bold text-foreground">No worries</p>
                    <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-muted-foreground">
                      {displayInvite.fromPlayerName} will be notified. Maybe next time! You can still
                      create an account to find other players near you.
                    </p>
                    <Button
                      variant="outline"
                      size="lg"
                      className="mt-4 gap-2"
                      onClick={() =>
                        toast.success("Redirecting to sign up...")
                      }
                    >
                      <Sparkles className="h-4 w-4" />
                      Explore MatchMaker
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Right column: Value propositions -- always visible */}
          <div className="flex flex-col gap-6 lg:col-span-2">
            <Card className="border-border/40">
              <CardContent className="p-6">
                <h3 className="mb-5 text-lg font-bold text-foreground">
                  Why players love MatchMaker
                </h3>
                <div className="flex flex-col gap-5">
                  {[
                    {
                      icon: Users,
                      title: "Smart Matchmaking",
                      description:
                        "Find opponents at your level, near you, and available when you are. No more endless WhatsApp group messages.",
                    },
                    {
                      icon: BarChart3,
                      title: "Track Your Progress",
                      description:
                        "See your level evolve over time, review match history, and understand your game with real stats.",
                    },
                    {
                      icon: Zap,
                      title: "One-Tap Scheduling",
                      description:
                        "Say when and where you want to play. We suggest opponents, send invites, and set reminders automatically.",
                    },
                    {
                      icon: Shield,
                      title: "Fair & Transparent",
                      description:
                        "Every result is confirmed by both players. Your level reflects real performance, not self-reported skill.",
                    },
                    {
                      icon: TrendingUp,
                      title: "Community Rankings",
                      description:
                        "Compete on local leaderboards, discover rising players in your area, and find your next great rival.",
                    },
                  ].map((item) => (
                    <div key={item.title} className="flex gap-3.5">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10">
                        <item.icon className="h-5 w-5 text-primary" />
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-foreground">{item.title}</p>
                        <p className="mt-0.5 text-sm leading-relaxed text-muted-foreground">
                          {item.description}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Social proof card */}
            <Card className="border-border/40">
              <CardContent className="p-6">
                <div className="grid grid-cols-2 gap-4">
                  <div className="text-center">
                    <p className="font-mono text-2xl font-bold text-primary">2,400+</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">Active players</p>
                  </div>
                  <div className="text-center">
                    <p className="font-mono text-2xl font-bold text-primary">8,500+</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">Matches played</p>
                  </div>
                  <div className="text-center">
                    <p className="font-mono text-2xl font-bold text-primary">15</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">Cities</p>
                  </div>
                  <div className="text-center">
                    <p className="font-mono text-2xl font-bold text-primary">4.8</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">App rating</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="mt-16 border-t border-border/40 py-8">
        <div className="mx-auto flex max-w-5xl flex-col items-center gap-3 px-5 sm:flex-row sm:justify-between">
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary">
              <TennisBallIcon className="h-4 w-4 text-primary-foreground" />
            </div>
            <span className="text-sm font-semibold text-foreground">MatchMaker</span>
          </div>
          <p className="text-sm text-muted-foreground">
            The simplest way to organize your tennis matches.
          </p>
        </div>
      </footer>
    </div>
  )
}
