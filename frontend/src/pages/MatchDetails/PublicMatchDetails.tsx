import { useState, useEffect } from "react"
import { useParams } from "react-router-dom"
import { Calendar, Clock, MapPin, Loader2, Users } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { SportFormatBadge } from "@/components/sport-format-badge"
import { matchesService } from "@/lib/services/matches.service"
import type { Match } from "@/lib/types"

function TennisBallIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="1.5" />
      <path d="M6 3.5C9.5 6 9.5 18 6 20.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M18 3.5C14.5 6 14.5 18 18 20.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )
}

export default function PublicMatchDetails() {
  const { token } = useParams<{ token: string }>()
  const [match, setMatch] = useState<Match | null>(null)
  const [state, setState] = useState<"loading" | "found" | "not-found">("loading")

  useEffect(() => {
    if (!token) { setState("not-found"); return }
    matchesService
      .getByPublicToken(token)
      .then((m) => { setMatch(m); setState("found") })
      .catch(() => setState("not-found"))
  }, [token])

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border/40 bg-card/80 backdrop-blur-sm">
        <div className="mx-auto flex max-w-lg items-center px-5 py-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary">
              <TennisBallIcon className="h-5 w-5 text-primary-foreground" />
            </div>
            <span className="text-lg font-bold tracking-tight text-foreground">Matchmaker</span>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-lg px-5 py-8">
        {state === "loading" && (
          <div className="flex flex-col items-center justify-center gap-4 py-24">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        )}

        {state === "not-found" && (
          <div className="flex flex-col items-center justify-center gap-4 py-24 text-center">
            <p className="text-lg font-semibold text-foreground">Match not found</p>
            <p className="text-sm text-muted-foreground">This link may have expired or the match may have been cancelled.</p>
          </div>
        )}

        {state === "found" && match && (
          <div className="flex flex-col gap-6">
            <div className="text-center">
              <h1 className="text-2xl font-bold tracking-tight text-foreground">Match details</h1>
            </div>

            <Card className="border-border/40">
              <CardContent className="flex flex-col gap-4 pt-6 text-sm">
                {(match.sport || match.format) && (
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Sport</span>
                    <SportFormatBadge sport={match.sport ?? "tennis"} format={match.format ?? "singles"} />
                  </div>
                )}

                <div className="flex items-center gap-2 text-muted-foreground">
                  <Calendar className="h-4 w-4 shrink-0" />
                  <span>{match.date}</span>
                </div>

                <div className="flex items-center gap-2 text-muted-foreground">
                  <Clock className="h-4 w-4 shrink-0" />
                  <span>{match.time}{match.endTime ? ` – ${match.endTime}` : ""}</span>
                </div>

                <div className="flex items-center gap-2 text-muted-foreground">
                  <MapPin className="h-4 w-4 shrink-0" />
                  <span>{match.location || "TBD"}</span>
                </div>

                {match.participants && match.participants.length > 0 && (
                  <div className="flex items-start gap-2 text-muted-foreground">
                    <Users className="mt-0.5 h-4 w-4 shrink-0" />
                    <span>{match.participants.map((p) => p.userName ?? "Player").join(" · ")}</span>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        )}
      </main>
    </div>
  )
}
