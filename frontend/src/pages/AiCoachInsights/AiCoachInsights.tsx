import { useState } from "react"
import { Link } from "react-router-dom"
import {
  BarChart3,
  Target,
  TrendingUp,
  TrendingDown,
  Swords,
  Flame,
  Layers,
  Clock,
  ChevronDown,
  ChevronUp,
  ArrowRight,
  Lightbulb,
  ShieldCheck,
} from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { PageHeader } from "@/components/page-header"

// ---- Mock AI-generated insights data ----

const performanceInsights = [
  {
    id: "perf-01",
    icon: TrendingDown,
    category: "pattern",
    title: "Win rate drops in long rallies against defensive players",
    detail:
      "When rallies exceed 8 shots against players with a defensive baseline style (like Maria Santos), your win rate on those points is only 35%. You tend to overhit trying to end the rally. Focus on maintaining depth and waiting for a genuine short ball.",
    severity: "warning" as const,
  },
  {
    id: "perf-02",
    icon: Layers,
    category: "surface",
    title: "Clay is your strongest surface by a significant margin",
    detail:
      "On clay your win rate is 71% (20 of 28 matches), compared to 48% on hard courts (12 of 25). Your topspin-heavy game and movement patterns are better suited to clay. Consider scheduling more hard court practice to close the gap.",
    severity: "positive" as const,
  },
  {
    id: "perf-03",
    icon: Clock,
    category: "timing",
    title: "Evening matches produce your best results",
    detail:
      "You have a 68% win rate in matches starting after 17:00, versus 45% before noon. This could be related to warm-up routine, energy levels, or simply your natural circadian rhythm. Try adjusting your morning warm-up to be longer and more gradual.",
    severity: "positive" as const,
  },
  {
    id: "perf-04",
    icon: Flame,
    category: "momentum",
    title: "You struggle to close out sets when leading 5-3",
    detail:
      "In 6 situations where you were serving at 5-3, you were broken 4 times and only converted the set on the first attempt twice. Work on a specific service game routine when you're ahead to reduce this conversion issue.",
    severity: "warning" as const,
  },
  {
    id: "perf-05",
    icon: Target,
    category: "pattern",
    title: "Your second serve is your biggest vulnerability",
    detail:
      "Opponents attack your second serve successfully 58% of the time. Your second serve speed averages only 42% of your first serve. Adding a higher-kicking second serve with more spin could give you better hold percentages.",
    severity: "warning" as const,
  },
]

const strategyRecommendations = [
  {
    opponent: "Maria Santos",
    playstyle: "Defensive baseliner",
    recommendation:
      "Against Maria, approaching the net early worked best in your recent wins. In your two victories, you won 73% of net points. In your two losses, you stayed on the baseline and lost the long-rally battle.",
    actionItems: [
      "Serve and approach on 60%+ of first serves",
      "Use slice to keep the ball low and draw her forward",
      "Attack any mid-court ball to her backhand",
    ],
  },
  {
    opponent: "Carlos Mendez",
    playstyle: "Aggressive all-court player",
    recommendation:
      "Carlos likes to dictate play early. Your best strategy has been to neutralize his power with deep returns and force him into longer rallies. In your 3 matches, you won when rallies averaged 6+ shots.",
    actionItems: [
      "Return deep to the center to reduce his angles",
      "Be patient in rallies, let him make the first error",
      "Target his backhand on big points",
    ],
  },
  {
    opponent: "Players above level 5.5",
    playstyle: "General",
    recommendation:
      "Against stronger opponents, you have a 33% win rate. Your best results came when you played aggressively and didn't let them settle. Passive play against higher-level opponents leads to 80% loss rate.",
    actionItems: [
      "Take the ball earlier and inside the baseline",
      "Increase first serve percentage above 65%",
      "Shorten warmup rallies to build aggression early",
    ],
  },
]

const historicalComparisons = [
  {
    metric: "Second-serve effectiveness",
    trend: "improving" as const,
    current: "42%",
    previous: "35%",
    detail:
      "Your second-serve win percentage has improved by 7 points compared to last month. Your added topspin is paying off, though there's still room to improve against aggressive returners.",
  },
  {
    metric: "Break point conversion",
    trend: "declining" as const,
    current: "38%",
    previous: "52%",
    detail:
      "Your break point conversion has dropped 14 points this month. Analysis shows you're being too passive on break points, hitting 40% fewer winners on these crucial points compared to regular points.",
  },
  {
    metric: "Net point win rate",
    trend: "improving" as const,
    current: "64%",
    previous: "55%",
    detail:
      "Coming to the net has been increasingly effective for you. Your volley placement has improved, and you're choosing better moments to approach. Keep building on this.",
  },
  {
    metric: "First set win rate",
    trend: "improving" as const,
    current: "67%",
    previous: "48%",
    detail:
      "You're starting matches much stronger. This correlates with your improved warm-up routine that you adopted in mid-January.",
  },
]

const futurePrep = [
  {
    playstyle: "Defensive baseliners",
    strategy: "Prioritize approaching the net and using variety (drop shots, angles) to break their rhythm. Avoid long crosscourt rallies from the baseline.",
    focus: "Net approaches and angle volleys",
  },
  {
    playstyle: "Big servers",
    strategy: "Stand further back on return, focus on getting the return in play deep. On your serve, target the body to reduce their return quality.",
    focus: "Return positioning and body serves",
  },
  {
    playstyle: "All-court aggressive players",
    strategy: "Match their aggression early. If you let them take control, they dominate. Take the ball early, use their pace against them.",
    focus: "Early ball-striking and court positioning",
  },
]

export default function AIPlayerInsightsPage() {
  const [expandedInsight, setExpandedInsight] = useState<string | null>(null)

  return (
    <>
      <PageHeader
        title="AI Player Insights"
        description="Advanced statistics and actionable learning from every match"
      />
      <div className="flex flex-1 flex-col gap-6 p-5 lg:p-8">
        {/* Intro Card */}
        <Card className="overflow-hidden">
          <div className="border-b border-border/30 bg-primary/5 px-6 py-6">
            <div className="flex items-start gap-4">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-primary/10">
                <BarChart3 className="h-6 w-6 text-primary" />
              </div>
              <div>
                <h2 className="text-lg font-bold tracking-tight text-foreground">
                  Your AI-Powered Insights Dashboard
                </h2>
                <p className="mt-1 text-base leading-relaxed text-muted-foreground">
                  Every match you play feeds the AI engine. Below you will find personal
                  performance patterns, strategic recommendations tailored to your frequent
                  opponents, historical comparisons to track your evolution, and preparation
                  guides for different play styles.
                </p>
              </div>
            </div>
          </div>
        </Card>

        {/* Tabbed sections */}
        <Tabs defaultValue="performance" className="space-y-6">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="performance" className="text-sm">Performance</TabsTrigger>
            <TabsTrigger value="strategy" className="text-sm">Strategy</TabsTrigger>
            <TabsTrigger value="history" className="text-sm">Trends</TabsTrigger>
            <TabsTrigger value="preparation" className="text-sm">Preparation</TabsTrigger>
          </TabsList>

          {/* ==== PERFORMANCE INSIGHTS ==== */}
          <TabsContent value="performance" className="space-y-4">
            <div className="space-y-3">
              {performanceInsights.map((insight) => {
                const Icon = insight.icon
                const isExpanded = expandedInsight === insight.id
                const borderColor =
                  insight.severity === "warning"
                    ? "border-chart-5/30"
                    : "border-primary/30"
                const bgColor =
                  insight.severity === "warning"
                    ? "bg-chart-5/5"
                    : "bg-primary/5"
                return (
                  <button
                    key={insight.id}
                    type="button"
                    onClick={() =>
                      setExpandedInsight(isExpanded ? null : insight.id)
                    }
                    className={`w-full rounded-2xl border ${borderColor} ${bgColor} p-5 text-left transition-all hover:shadow-sm`}
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
                          insight.severity === "warning"
                            ? "bg-chart-5/10"
                            : "bg-primary/10"
                        }`}
                      >
                        <Icon
                          className={`h-5 w-5 ${
                            insight.severity === "warning"
                              ? "text-chart-5"
                              : "text-primary"
                          }`}
                        />
                      </div>
                      <p className="flex-1 text-base font-semibold text-foreground">
                        {insight.title}
                      </p>
                      {isExpanded ? (
                        <ChevronUp className="h-4 w-4 text-muted-foreground" />
                      ) : (
                        <ChevronDown className="h-4 w-4 text-muted-foreground" />
                      )}
                    </div>
                    {isExpanded && (
                      <p className="mt-3 pl-12 text-sm leading-relaxed text-muted-foreground">
                        {insight.detail}
                      </p>
                    )}
                  </button>
                )
              })}
            </div>
          </TabsContent>

          {/* ==== STRATEGY RECOMMENDATIONS ==== */}
          <TabsContent value="strategy" className="space-y-4">
            {strategyRecommendations.map((rec, i) => (
              <Card key={i}>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base font-bold tracking-tight">
                    <Swords className="h-4 w-4 text-primary" />
                    vs {rec.opponent}
                    <span className="ml-2 rounded-lg bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                      {rec.playstyle}
                    </span>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm leading-relaxed text-foreground">
                    {rec.recommendation}
                  </p>
                  <div className="mt-4 space-y-2">
                    <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      Action items
                    </p>
                    {rec.actionItems.map((item, j) => (
                      <div key={j} className="flex items-start gap-2">
                        <ArrowRight className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
                        <p className="text-sm text-foreground">{item}</p>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            ))}
          </TabsContent>

          {/* ==== HISTORICAL COMPARISONS ==== */}
          <TabsContent value="history" className="space-y-4">
            {historicalComparisons.map((comp, i) => (
              <Card key={i}>
                <CardContent className="p-5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      {comp.trend === "improving" ? (
                        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
                          <TrendingUp className="h-5 w-5 text-primary" />
                        </div>
                      ) : (
                        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-destructive/10">
                          <TrendingDown className="h-5 w-5 text-destructive" />
                        </div>
                      )}
                      <div>
                        <p className="text-base font-semibold text-foreground">
                          {comp.metric}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          {comp.trend === "improving" ? "Improved" : "Declined"} vs last month
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="font-mono text-xl font-bold text-foreground">
                        {comp.current}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        was {comp.previous}
                      </p>
                    </div>
                  </div>
                  <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                    {comp.detail}
                  </p>
                </CardContent>
              </Card>
            ))}
          </TabsContent>

          {/* ==== FUTURE MATCH PREPARATION ==== */}
          <TabsContent value="preparation" className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Preparation guides tailored to common play styles you face. Use these
              before matches to set your tactical mindset.
            </p>
            {futurePrep.map((prep, i) => (
              <Card key={i}>
                <CardContent className="p-5">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
                      <ShieldCheck className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <p className="text-base font-semibold text-foreground">
                        vs {prep.playstyle}
                      </p>
                      <p className="text-xs font-semibold uppercase tracking-wider text-primary">
                        Focus: {prep.focus}
                      </p>
                    </div>
                  </div>
                  <p className="mt-3 text-sm leading-relaxed text-foreground">
                    {prep.strategy}
                  </p>
                </CardContent>
              </Card>
            ))}

            <Card className="overflow-hidden">
              <div className="bg-accent/60 px-5 py-4">
                <div className="flex items-center gap-3">
                  <Lightbulb className="h-5 w-5 text-primary" />
                  <p className="text-sm text-accent-foreground">
                    Want a strategy tailored to a specific upcoming match?{" "}
                    <Link
                      to="/ai-coach/companion"
                      className="font-semibold text-primary underline-offset-2 hover:underline"
                    >
                      Try the AI Match Companion
                    </Link>
                  </p>
                </div>
              </div>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </>
  )
}
