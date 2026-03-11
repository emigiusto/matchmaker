import { Link } from "react-router-dom"
import { format } from "date-fns"
import { Calendar, MapPin, TrendingUp, Clock as ClockIcon } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { PageHeader } from "@/components/page-header"
// TODO: wire to API — replace with matchesService.getPast()
import { mockMatches, CURRENT_USER_ID } from "@/lib/mock-data"

export default function PastMatchesPage() {
  const pastMatches = mockMatches.filter((m) => m.status === "completed")

  return (
    <>
      <PageHeader title="Past Matches" description="Your match history" />
      <div className="flex flex-1 flex-col gap-4 p-5 lg:p-8">
        {pastMatches.length === 0 ? (
          <Card>
            <CardContent className="py-20 text-center">
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-muted">
                <ClockIcon className="h-7 w-7 text-muted-foreground" />
              </div>
              <p className="text-lg font-medium text-foreground">No past matches yet</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {pastMatches.map((match) => {
              const opponent =
                match.player1.userId === CURRENT_USER_ID ? match.player2 : match.player1
              const isWinner = match.result?.winnerId === "player-001"
              return (
                <Link key={match.id} to={`/matches/${match.id}`}>
                  <Card className="transition-all hover:shadow-lg">
                    <CardContent className="flex items-center justify-between p-5">
                      <div className="flex items-center gap-5">
                        <div
                          className={`flex h-12 w-12 items-center justify-center rounded-full text-base font-bold ${
                            isWinner
                              ? "bg-primary/10 text-primary"
                              : "bg-muted text-muted-foreground"
                          }`}
                        >
                          {opponent.name.split(" ").map((n) => n[0]).join("")}
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <p className="text-base font-semibold text-foreground">
                              vs {opponent.name}
                            </p>
                          </div>
                          <div className="mt-2 flex items-center gap-5 text-sm text-muted-foreground">
                            <span className="flex items-center gap-1.5">
                              <Calendar className="h-4 w-4" />
                              {format(new Date(match.date), "MMM d, yyyy")}
                            </span>
                            <span className="flex items-center gap-1.5">
                              <MapPin className="h-4 w-4" />
                              {match.location}
                            </span>
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-4">
                        {match.result && (
                          <div className="text-right">
                            <p className="font-mono text-base font-bold text-foreground">
                              {match.result.sets
                                .map((s) => `${s.player1Score}-${s.player2Score}`)
                                .join("  ")}
                            </p>
                            <div className="mt-0.5 flex items-center justify-end gap-1 text-sm">
                              {isWinner ? (
                                <>
                                  <TrendingUp className="h-3.5 w-3.5 text-primary" />
                                  <span className="font-semibold text-primary">Won</span>
                                  {match.result.player1RatingChange && (
                                    <span className="font-mono text-primary">
                                      (+{match.result.player1RatingChange})
                                    </span>
                                  )}
                                </>
                              ) : (
                                <span className="text-muted-foreground">Lost</span>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              )
            })}
          </div>
        )}
      </div>
    </>
  )
}
