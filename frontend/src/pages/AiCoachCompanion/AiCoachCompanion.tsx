import { useState } from "react"
import {
  BrainCircuit,
  Target,
  AlertTriangle,
  RefreshCw,
  Swords,
  ChevronRight,
  Loader2,
  Shield,
  Zap,
  ArrowRight,
} from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { PageHeader } from "@/components/page-header"
import {
  // TODO: wire to API — replace with matchesService.getUpcoming()
  mockMatches,
  CURRENT_USER_ID,
} from "@/lib/mock-data"

// Mock upcoming matches for the selector
const upcomingMatches = mockMatches.filter((m) => m.status === "scheduled")

// Pre-built strategy output (mock AI result)
const mockStrategy = {
  opponent: "Maria Santos",
  opponentLevel: 5.0,
  highLevelStrategy:
    "You should aim to shorten points and attack the backhand early. Maria tends to build rallies from the baseline, so disrupting her rhythm with early aggression will be key.",
  tacticalRecommendations: [
    {
      title: "Serve patterns to prioritize",
      detail:
        "Target her backhand side on first serve (wide on deuce, T on ad). Use slice serves to open up the court and follow to the net.",
    },
    {
      title: "Rally length to aim for",
      detail:
        "Keep rallies under 5 shots. Your win rate in short rallies against similar players is 72%, but it drops to 41% after 8+ shots.",
    },
    {
      title: "When to approach the net",
      detail:
        "Approach on any short ball to the backhand side. Maria's passing shot accuracy is lower on the backhand (she tends to go crosscourt). Cover the crosscourt pass.",
    },
    {
      title: "What to avoid",
      detail:
        "Avoid long crosscourt baseline rallies to her forehand. She's most comfortable hitting inside-out forehands and can dictate from that position.",
    },
  ],
  riskWarnings: [
    "Long baseline exchanges favor Maria. If rallies stretch beyond 6 shots, she controls the point 60% of the time.",
    "Her first serve percentage has improved recently. Be ready for more free points on her serve.",
    "If she gets ahead early in a set, her confidence and aggression increase significantly.",
  ],
  adaptationTips: [
    {
      scenario: "If the serve-and-volley approach isn't working",
      suggestion:
        "Switch to hitting deep, heavy topspin to her backhand and wait for a short ball. Then attack the open court rather than approaching.",
    },
    {
      scenario: "If she starts dictating with her forehand",
      suggestion:
        "Redirect to her backhand and use drop shots to pull her forward. She's less comfortable at the net.",
    },
    {
      scenario: "If you're losing the second set after winning the first",
      suggestion:
        "Slow the pace down. Take more time between points, use higher margin shots, and focus on making her hit one more ball.",
    },
  ],
}

export default function AIMatchCompanionPage() {
  const [selectedMatchId, setSelectedMatchId] = useState<string | null>(null)
  const [generating, setGenerating] = useState(false)
  const [strategy, setStrategy] = useState<typeof mockStrategy | null>(null)

  function handleGenerate() {
    if (!selectedMatchId) return
    setGenerating(true)
    // Simulate AI generation
    setTimeout(() => {
      setStrategy(mockStrategy)
      setGenerating(false)
    }, 2000)
  }

  return (
    <>
      <PageHeader
        title="AI Match Companion"
        description="Build a custom match strategy for your next opponent"
      />
      <div className="flex flex-1 flex-col gap-6 p-5 lg:p-8">
        {/* Intro */}
        <Card className="overflow-hidden">
          <div className="border-b border-border/30 bg-primary/5 px-6 py-6">
            <div className="flex items-start gap-4">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-primary/10">
                <BrainCircuit className="h-6 w-6 text-primary" />
              </div>
              <div>
                <h2 className="text-lg font-bold tracking-tight text-foreground">
                  Prepare to win your next match
                </h2>
                <p className="mt-1 text-base leading-relaxed text-muted-foreground">
                  Select an upcoming match and the AI will analyze both player profiles, past
                  head-to-head data, and play styles to build you a tailored match strategy.
                </p>
              </div>
            </div>
          </div>
        </Card>

        {/* Match Selector */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg font-bold tracking-tight">
              Select Upcoming Match
            </CardTitle>
          </CardHeader>
          <CardContent>
            {upcomingMatches.length === 0 ? (
              <p className="py-8 text-center text-base text-muted-foreground">
                No upcoming matches. Schedule one to get a custom strategy.
              </p>
            ) : (
              <div className="space-y-3">
                {upcomingMatches.map((match) => {
                  const opp =
                    match.player1.userId === CURRENT_USER_ID
                      ? match.player2
                      : match.player1
                  const isSelected = selectedMatchId === match.id
                  return (
                    <button
                      key={match.id}
                      type="button"
                      onClick={() => {
                        setSelectedMatchId(match.id)
                        setStrategy(null)
                      }}
                      className={`flex w-full items-center justify-between rounded-2xl border p-4 text-left transition-all ${
                        isSelected
                          ? "border-primary bg-primary/5"
                          : "border-border/40 bg-muted/20 hover:bg-muted/40"
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-sm font-bold text-primary">
                          {opp.name
                            .split(" ")
                            .map((n) => n[0])
                            .join("")}
                        </div>
                        <div>
                          <p className="text-base font-semibold text-foreground">
                            vs {opp.name}
                          </p>
                          <p className="text-sm text-muted-foreground">
                            {match.date} at {match.time} -- {match.location}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="rounded-lg bg-muted px-2.5 py-1 font-mono text-sm text-muted-foreground">
                          Lvl {opp.levelValue.toFixed(1)}
                        </span>
                        <ChevronRight
                          className={`h-4 w-4 transition-colors ${
                            isSelected ? "text-primary" : "text-muted-foreground"
                          }`}
                        />
                      </div>
                    </button>
                  )
                })}
              </div>
            )}

            <Button
              className="mt-5 w-full gap-2"
              size="lg"
              disabled={!selectedMatchId || generating}
              onClick={handleGenerate}
            >
              {generating ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Analyzing profiles and building strategy...
                </>
              ) : (
                <>
                  <BrainCircuit className="h-4 w-4" />
                  Generate Match Strategy
                </>
              )}
            </Button>
          </CardContent>
        </Card>

        {/* Strategy Output */}
        {strategy && (
          <div className="space-y-6">
            {/* High-level strategy */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg font-bold tracking-tight">
                  <Target className="h-5 w-5 text-primary" />
                  High-Level Strategy vs {strategy.opponent}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="rounded-2xl bg-primary/5 p-5">
                  <p className="text-base leading-relaxed text-foreground">
                    {strategy.highLevelStrategy}
                  </p>
                </div>
              </CardContent>
            </Card>

            {/* Tactical Recommendations */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg font-bold tracking-tight">
                  <Swords className="h-5 w-5 text-primary" />
                  Tactical Recommendations
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {strategy.tacticalRecommendations.map((rec, i) => (
                    <div
                      key={i}
                      className="rounded-2xl border border-border/40 bg-muted/20 p-4"
                    >
                      <p className="text-sm font-semibold uppercase tracking-wider text-primary">
                        {rec.title}
                      </p>
                      <p className="mt-2 text-base leading-relaxed text-foreground">
                        {rec.detail}
                      </p>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Risk Warnings */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg font-bold tracking-tight">
                  <AlertTriangle className="h-5 w-5 text-destructive" />
                  Risk Warnings
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {strategy.riskWarnings.map((warning, i) => (
                    <div
                      key={i}
                      className="flex gap-3 rounded-2xl border border-destructive/20 bg-destructive/5 p-4"
                    >
                      <Shield className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
                      <p className="text-sm leading-relaxed text-foreground">
                        {warning}
                      </p>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Adaptation Tips */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg font-bold tracking-tight">
                  <RefreshCw className="h-5 w-5 text-primary" />
                  Adaptation Tips
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {strategy.adaptationTips.map((tip, i) => (
                    <div
                      key={i}
                      className="rounded-2xl border border-border/40 bg-muted/20 p-4"
                    >
                      <div className="flex items-center gap-2">
                        <Zap className="h-4 w-4 text-primary" />
                        <p className="text-sm font-semibold text-foreground">
                          {tip.scenario}
                        </p>
                      </div>
                      <div className="mt-2 flex items-start gap-2 pl-6">
                        <ArrowRight className="mt-1 h-3 w-3 shrink-0 text-primary" />
                        <p className="text-sm leading-relaxed text-muted-foreground">
                          {tip.suggestion}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </>
  )
}
