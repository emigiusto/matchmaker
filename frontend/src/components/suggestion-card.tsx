import { useState } from "react"
import { Link } from "react-router-dom"
import { MapPin, TrendingUp, Clock, Swords, Users } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { toast } from "sonner"
import type { SuggestedOpponent } from "@/lib/types"

interface SuggestionCardProps {
  suggestion: SuggestedOpponent
}

export function SuggestionCard({ suggestion }: SuggestionCardProps) {
  const [inviteSent, setInviteSent] = useState(false)
  const [selectedSlot, setSelectedSlot] = useState<string | null>(null)
  const { player, distance, levelDifference, availabilityOverlap, reason } = suggestion

  const canInvite = selectedSlot !== null

  function handleInvite() {
    if (!canInvite) return
    setInviteSent(true)
    toast.success(`Invite sent to ${player.name} for ${selectedSlot}. They will be notified for confirmation.`)
  }

  return (
    <Card className="group overflow-hidden transition-all hover:shadow-lg hover:shadow-primary/5">
      <CardContent className="p-0">
        {/* Header strip */}
        <div className="flex items-center justify-between border-b border-border/30 bg-muted/30 px-5 py-4">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-base font-bold text-primary transition-colors group-hover:bg-primary group-hover:text-primary-foreground">
              {player.name.split(" ").map((n) => n[0]).join("")}
            </div>
            <div className="min-w-0">
              <h3 className="truncate text-sm font-semibold text-foreground">{player.name}</h3>
              <p className="font-mono text-sm text-muted-foreground">
                Level {player.levelValue.toFixed(1)}
              </p>
            </div>
          </div>
          <div className="flex flex-col items-end gap-0.5">
            <span className="flex items-center gap-1 text-sm text-muted-foreground">
              <Swords className="h-3.5 w-3.5" />
              {player.matchesPlayed} matches
            </span>
            <span className="text-xs text-muted-foreground">
              {player.wins}W - {player.losses}L
            </span>
          </div>
        </div>

        <div className="px-5 py-5">
          {/* Metrics */}
          <div className="flex flex-wrap gap-3">
            <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <MapPin className="h-4 w-4 text-primary/60" />
              <span>{distance} km</span>
            </div>
            <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <TrendingUp className="h-4 w-4 text-primary/60" />
              <span>{levelDifference > 0 ? "+" : ""}{levelDifference} level</span>
            </div>
            <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <Users className="h-4 w-4 text-primary/60" />
              <span>{player.wins}W - {player.losses}L</span>
            </div>
          </div>

          {/* Reason */}
          <div className="mt-4 rounded-xl bg-accent/60 px-4 py-3">
            <p className="text-sm leading-relaxed text-accent-foreground">
              {reason}
            </p>
          </div>

          {/* Time slots - select one to enable invite */}
          {availabilityOverlap.length > 0 && (
            <div className="mt-4">
              <p className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Select a time to invite
              </p>
              <div className="flex flex-wrap gap-2">
                {availabilityOverlap.map((slot) => (
                  <button
                    key={slot}
                    type="button"
                    onClick={() => setSelectedSlot(selectedSlot === slot ? null : slot)}
                    disabled={inviteSent}
                    className={`rounded-lg border px-3 py-1.5 text-sm transition-all ${
                      selectedSlot === slot
                        ? "border-primary bg-primary/10 font-medium text-primary"
                        : "border-border/50 bg-card text-muted-foreground hover:border-primary/30"
                    } ${inviteSent ? "opacity-50" : ""}`}
                  >
                    <Clock className="mr-1 inline-block h-3.5 w-3.5" />
                    {slot}
                  </button>
                ))}
              </div>
            </div>
          )}

          {availabilityOverlap.length === 0 && (
            <div className="mt-4 rounded-xl border border-border/40 bg-muted/30 px-4 py-3">
              <p className="text-sm text-muted-foreground">
                No overlapping availability. Check back later.
              </p>
            </div>
          )}

          {/* Actions */}
          <div className="mt-5 flex gap-2">
            <Button
              className="flex-1"
              disabled={!canInvite || inviteSent}
              onClick={handleInvite}
            >
              {inviteSent ? "Invite Sent" : canInvite ? `Invite for ${selectedSlot}` : "Select a time to invite"}
            </Button>
            <Button variant="outline" asChild>
              <Link to={`/profile/${player.userId}`}>Profile</Link>
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
