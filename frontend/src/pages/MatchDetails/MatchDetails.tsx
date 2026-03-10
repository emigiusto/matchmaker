import { useState } from "react"
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
import { MatchTypeBadge } from "@/components/match-type-badge"
import { StatusBadge } from "@/components/status-badge"
import { AddReminderDialog } from "@/components/add-reminder-dialog"
import { AddToCalendarButton } from "@/components/add-to-calendar-button"
import { ResultUploadDialog } from "@/components/result-upload-dialog"
import { toast } from "sonner"
// TODO: wire to API — replace with matchesService.getById(id)
import { mockMatches, CURRENT_USER_ID } from "@/lib/mock-data"

export default function MatchDetailPage() {
  const { id } = useParams<{ id: string }>()
  const match = mockMatches.find((m) => m.id === id)
  const [resultSubmitted, setResultSubmitted] = useState(false)
  const [disputeOpen, setDisputeOpen] = useState(false)

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

  const isPlayer1 = match.player1.userId === CURRENT_USER_ID
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
        <Card className="overflow-hidden border-border/50">
          <div className="border-b border-border/40 bg-muted/30 px-6 py-4">
            <div className="flex flex-wrap items-center gap-3">
              <MatchTypeBadge type={match.matchType} />
              <StatusBadge status={match.status} />
              <span className="text-xs text-muted-foreground">
                {format(new Date(match.date), "EEEE, MMMM d, yyyy")}
              </span>
            </div>
          </div>
          <CardContent className="p-6">
            {/* Players vs display */}
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

              {/* Add Reminder & Calendar */}
              {(match.status === "scheduled" || match.status === "awaiting_confirmation") && (
                <div className="mt-6 flex items-center justify-center gap-3 border-t border-border/30 pt-4">
                  <AddReminderDialog
                    matchId={match.id}
                    matchDate={match.date}
                    matchTime={match.time}
                    opponent={opponent.name}
                    location={match.location}
                    trigger={
                      <Button variant="outline" size="lg" className="gap-2">
                        <Bell className="h-5 w-5" />
                        Add Reminder
                      </Button>
                    }
                  />
                  <AddToCalendarButton
                    date={match.date}
                    time={match.time}
                    location={match.location}
                    opponent={opponent.name}
                    matchType={match.matchType}
                  />
                </div>
              )}
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
                  Upload the match result after playing
                </p>
                <ResultUploadDialog
                  match={match}
                  onResultSubmitted={() => setResultSubmitted(true)}
                  trigger={
                    <Button size="lg" className="gap-2">
                      Upload Result
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
              {[currentPlayer, opponent].map((player) => (
                <Link
                  key={player.id}
                  to={`/profile/${player.userId}`}
                  className="flex items-center gap-4 rounded-xl border border-border/50 bg-muted/20 p-4 transition-colors hover:bg-muted/40"
                >
                  <div className="flex h-11 w-11 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary">
                    {player.name.split(" ").map((n) => n[0]).join("")}
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-medium text-foreground">{player.name}</p>
                    <p className="text-xs text-muted-foreground">{player.city}</p>
                  </div>
                  <div className="text-right">
                    <p className="font-mono text-sm font-semibold text-foreground">
                      {player.levelValue.toFixed(1)}
                    </p>
                    <p className="text-xs text-muted-foreground">Level</p>
                  </div>
                </Link>
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
