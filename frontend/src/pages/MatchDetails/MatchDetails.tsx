import { useState, useEffect } from "react"
import { Link, useParams } from "react-router-dom"
import { format } from "date-fns"
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
import { PageHeader } from "@/components/page-header"
import { StatusBadge } from "@/components/status-badge"
import { AddReminderDialog } from "@/components/add-reminder-dialog"
import { AddToCalendarButton } from "@/components/add-to-calendar-button"
import { CancelMatchButton } from "@/components/cancel-match-button"
import { toast } from "sonner"
import { getCurrentUserId } from "@/lib/current-user"
import { matchesService } from "@/lib/services/matches.service"
import { remindersService, type Reminder } from "@/lib/services/reminders.service"
import type { Match } from "@/lib/types"
import { Loader2 } from "lucide-react"

export default function MatchDetailPage() {
  const { id } = useParams<{ id: string }>()
  const currentUserId = getCurrentUserId()
  const [match, setMatch] = useState<Match | null>(null)
  const [loading, setLoading] = useState(true)
  const [reminders, setReminders] = useState<Reminder[]>([])
  const [remindersLoading, setRemindersLoading] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [resultSubmitted, setResultSubmitted] = useState(false)
  const [disputeOpen, setDisputeOpen] = useState(false)

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
        <PageHeader title="Match" />
        <div className="flex flex-1 items-center justify-center p-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </>
    )
  }

  if (!match) {
    return (
      <>
        <PageHeader title="Match" />
        <div className="flex flex-1 items-center justify-center p-8">
          <div className="text-center">
            <p className="text-sm text-muted-foreground">Match not found</p>
            <Button variant="ghost" className="mt-4" asChild>
              <Link to="/dashboard">Back to Dashboard</Link>
            </Button>
          </div>
        </div>
      </>
    )
  }

  const isPlayer1 = match.player1.userId === currentUserId
  const opponent = isPlayer1 ? match.player2 : match.player1
  const currentPlayer = isPlayer1 ? match.player1 : match.player2

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
      <PageHeader title="Match Detail">
        <Button variant="ghost" size="sm" asChild>
          <Link to="/dashboard">
            <ArrowLeft className="mr-1.5 h-4 w-4" /> Back
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
                This match has been cancelled and will not take place
              </p>
            </div>
          )}
          <div className="border-b border-border/40 bg-muted/30 px-6 py-4">
            <div className="flex flex-wrap items-center gap-3">
              <StatusBadge status={match.status} />
              <span className="text-xs text-muted-foreground">
                {format(new Date(match.date), "EEEE, MMMM d, yyyy")}
              </span>
            </div>
          </div>
          <CardContent className={`p-6 ${match.status === "cancelled" ? "opacity-75" : ""}`}>
            {/* Players display: vs when teams known; participant list for doubles before result */}
            {match.showVsLayout !== false ? (
              (match.participants ?? []).length >= 4 ? (
                /* Doubles with teams: Team A vs Team B — all 4 players */
                <div className="flex items-center justify-center gap-8">
                  <div className="flex flex-col items-center gap-3">
                    <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Team A</span>
                    <div className="flex flex-wrap justify-center gap-3">
                      {(match.participants ?? [])
                        .filter((p) => p.team === "A")
                        .map((p) => (
                          <div key={p.userId} className="flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1.5">
                            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/20 text-xs font-bold text-primary">
                              {(p.userName ?? "?").split(" ").map((n) => n[0]).join("")}
                            </div>
                            <span className="text-sm font-medium">{p.userName ?? "Participant"}</span>
                          </div>
                        ))}
                    </div>
                  </div>
                  <div className="flex flex-col items-center gap-1">
                    <span className="text-2xl font-bold text-muted-foreground/40">vs</span>
                    {match.result && (
                      <p className="font-mono text-lg font-bold text-foreground">
                        {match.result.sets.map((s) => `${s.player1Score}-${s.player2Score}`).join(" ")}
                      </p>
                    )}
                  </div>
                  <div className="flex flex-col items-center gap-3">
                    <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Team B</span>
                    <div className="flex flex-wrap justify-center gap-3">
                      {(match.participants ?? [])
                        .filter((p) => p.team === "B")
                        .map((p) => (
                          <div key={p.userId} className="flex items-center gap-2 rounded-full bg-muted px-3 py-1.5">
                            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-muted-foreground/20 text-xs font-bold text-muted-foreground">
                              {(p.userName ?? "?").split(" ").map((n) => n[0]).join("")}
                            </div>
                            <span className="text-sm font-medium">{p.userName ?? "Participant"}</span>
                          </div>
                        ))}
                    </div>
                  </div>
                </div>
              ) : (
                /* Singles: 1 vs 1 */
                <div className="flex items-center justify-center gap-8">
                  <div className="flex flex-col items-center gap-2">
                    <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/10 text-lg font-bold text-primary">
                      {currentPlayer.name.split(" ").map((n) => n[0]).join("")}
                    </div>
                    <div className="text-center">
                      <p className="text-sm font-semibold text-foreground">{currentPlayer.name}</p>
                      <p className="font-mono text-xs text-muted-foreground">Level {currentPlayer.levelValue.toFixed(1)}</p>
                    </div>
                  </div>
                  <div className="flex flex-col items-center gap-1">
                    <span className="text-2xl font-bold text-muted-foreground/40">vs</span>
                    {match.result && (
                      <p className="font-mono text-lg font-bold text-foreground">
                        {match.result.sets.map((s) => `${s.player1Score}-${s.player2Score}`).join(" ")}
                      </p>
                    )}
                  </div>
                  <div className="flex flex-col items-center gap-2">
                    <div className="flex h-16 w-16 items-center justify-center rounded-full bg-muted text-lg font-bold text-muted-foreground">
                      {opponent.name.split(" ").map((n) => n[0]).join("")}
                    </div>
                    <div className="text-center">
                      <p className="text-sm font-semibold text-foreground">{opponent.name}</p>
                      <p className="font-mono text-xs text-muted-foreground">Level {opponent.levelValue.toFixed(1)}</p>
                    </div>
                  </div>
                </div>
              )
            ) : (
              /* Doubles before result: teams unknown, list all participants */
              <div className="flex flex-col items-center gap-4">
                <p className="text-sm text-muted-foreground">Doubles — teams assigned when result is submitted</p>
                <div className="flex flex-wrap justify-center gap-4">
                  {(match.participants ?? []).map((p) => (
                    <div key={p.userId} className="flex items-center gap-2 rounded-full bg-muted/50 px-4 py-2">
                      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted text-sm font-semibold text-muted-foreground">
                        {(p.userName ?? "?").split(" ").map((n) => n[0]).join("")}
                      </div>
                      <span className="text-sm font-medium">{p.userName ?? "Participant"}</span>
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
                {format(new Date(match.date), "MMM d, yyyy")}
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

        {/* Reminders */}
        <Card className="border-border/50">
          <CardHeader>
            <CardTitle className="text-base font-semibold tracking-tight flex items-center gap-2">
              <Bell className="h-4 w-4" />
              Reminders
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              {match.status === "cancelled"
                ? "This match was cancelled. No reminders will be sent."
                : "Get a WhatsApp reminder before the match."}
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            {(match.status === "scheduled" || match.status === "awaiting_confirmation") && (
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
                      Add Reminder
                    </Button>
                  }
                />
              </div>
            )}
            <div>
              <h4 className="text-sm font-medium text-foreground mb-2">Your reminders</h4>
              {remindersLoading ? (
                <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Loading reminders…
                </div>
              ) : reminders.length === 0 ? (
                <p className="py-4 text-sm text-muted-foreground">
                  {(match.status === "scheduled" || match.status === "awaiting_confirmation")
                    ? "No reminders set. Add one above to get a WhatsApp reminder before the match."
                    : "No reminders were set for this match."}
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
                            {format(new Date(r.scheduledAt), "EEE, MMM d 'at' HH:mm")}
                          </p>
                          {r.status === "sent" && r.sentAt && (
                            <p className="text-xs text-muted-foreground">
                              Sent {format(new Date(r.sentAt), "MMM d, HH:mm")}
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
                          {r.status}
                        </span>
                        {r.status === "pending" && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive"
                            onClick={() => handleDeleteReminder(r.id)}
                            disabled={deletingId === r.id}
                            title="Remove reminder"
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
                    Match Result
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
                          Set {set.setNumber}
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
                        <span className="text-xs text-muted-foreground">Rating change:</span>
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
                      <p className="text-xs font-medium text-muted-foreground">Status</p>
                      <p className="mt-1 text-sm font-semibold text-foreground">
                        {match.status === "awaiting_confirmation"
                          ? "Awaiting Confirmation"
                          : "Confirmed"}
                      </p>
                    </div>
                  )}

                  {match.status === "awaiting_confirmation" && (
                    <div className="flex gap-2">
                      <Button size="sm" onClick={handleConfirmResult}>
                        <CheckCircle className="mr-1.5 h-4 w-4" />
                        Confirm Result
                      </Button>
                      <Dialog open={disputeOpen} onOpenChange={setDisputeOpen}>
                        <DialogTrigger asChild>
                          <Button size="sm" variant="outline">
                            <AlertTriangle className="mr-1.5 h-4 w-4" />
                            Dispute
                          </Button>
                        </DialogTrigger>
                        <DialogContent>
                          <DialogHeader>
                            <DialogTitle>Dispute Result</DialogTitle>
                          </DialogHeader>
                          <form onSubmit={handleDisputeResult} className="space-y-4">
                            <div className="space-y-2">
                              <Label className="text-xs font-medium">Reason</Label>
                              <Textarea
                                placeholder="Explain why you're disputing this result..."
                                required
                              />
                            </div>
                            <Button type="submit" variant="destructive" className="w-full">
                              Submit Dispute
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
                  Submit Result
                </CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col items-center justify-center py-8">
                <p className="mb-4 text-center text-sm text-muted-foreground">
                  Submit result is temporarily disabled.
                </p>
                <Button size="lg" className="gap-2" disabled>
                  Upload Result
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
                  Result submitted, awaiting confirmation
                </p>
              </CardContent>
            </Card>
          )}

          {/* Players Card */}
          <Card className="border-border/50">
            <CardHeader>
              <CardTitle className="text-base font-semibold tracking-tight">Players</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {((match.participants ?? []).length >= 4
                ? (match.participants ?? []).map((p) => ({
                    id: p.userId,
                    userId: p.userId,
                    name: p.userName ?? "Participant",
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
                        <p className="text-xs text-muted-foreground">Level</p>
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
