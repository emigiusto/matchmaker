import { Link } from "react-router-dom"
import { format } from "date-fns"
import { Calendar, Clock, MapPin, Swords } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { PageHeader } from "@/components/page-header"
import { MatchTypeBadge } from "@/components/match-type-badge"
import { StatusBadge } from "@/components/status-badge"
import { AddReminderDialog } from "@/components/add-reminder-dialog"
import { AddToCalendarButton } from "@/components/add-to-calendar-button"
// TODO: wire to API — replace with matchesService.getUpcoming()
import { mockMatches, CURRENT_USER_ID } from "@/lib/mock-data"

export default function UpcomingMatchesPage() {
  const upcomingMatches = mockMatches.filter(
    (m) => m.status === "scheduled" || m.status === "awaiting_confirmation"
  )

  return (
    <>
      <PageHeader title="Upcoming Matches" description="Your scheduled matches" />
      <div className="flex flex-1 flex-col gap-4 p-5 lg:p-8">
        {upcomingMatches.length === 0 ? (
          <Card>
            <CardContent className="py-20 text-center">
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-muted">
                <Swords className="h-7 w-7 text-muted-foreground" />
              </div>
              <p className="text-lg font-medium text-foreground">No upcoming matches</p>
              <p className="mt-1 text-base text-muted-foreground">
                Create availability or accept an invite to get started
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {upcomingMatches.map((match) => {
              const opponent =
                match.player1.userId === CURRENT_USER_ID ? match.player2 : match.player1
              return (
                <Card key={match.id} className="transition-all hover:shadow-lg">
                  <CardContent className="p-5">
                    <Link
                      to={`/matches/${match.id}`}
                      className="flex items-center justify-between"
                    >
                      <div className="flex items-center gap-4">
                        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-base font-bold text-primary">
                          {opponent.name.split(" ").map((n) => n[0]).join("")}
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <p className="text-base font-semibold text-foreground">
                              vs {opponent.name}
                            </p>
                            <MatchTypeBadge type={match.matchType} />
                          </div>
                          <div className="mt-2 flex items-center gap-4 text-sm text-muted-foreground">
                            <span className="flex items-center gap-1.5">
                              <Calendar className="h-4 w-4" />
                              {format(new Date(match.date), "EEEE, MMM d")}
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
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                    <span className="font-mono text-sm text-muted-foreground">
                      Level {opponent.levelValue.toFixed(1)}
                    </span>
                        <StatusBadge status={match.status} />
                      </div>
                    </Link>
                <div className="mt-4 flex items-center gap-2 border-t border-border/30 pt-3">
                  <AddReminderDialog
                    matchId={match.id}
                    matchDate={match.date}
                    matchTime={match.time}
                    opponent={opponent.name}
                    location={match.location}
                  />
                  <AddToCalendarButton
                    date={match.date}
                    time={match.time}
                    location={match.location}
                    opponent={opponent.name}
                    matchType={match.matchType}
                    compact
                  />
                </div>
                  </CardContent>
                </Card>
              )
            })}
          </div>
        )}
      </div>
    </>
  )
}
