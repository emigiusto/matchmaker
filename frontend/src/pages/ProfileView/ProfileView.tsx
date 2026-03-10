import { Link, useParams } from "react-router-dom"
import {
  ArrowLeft,
  MapPin,
  TrendingUp,
  UserPlus,
  Swords,
  Target,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { PageHeader } from "@/components/page-header"
import { toast } from "sonner"
// TODO: wire to API — replace with playersService.getByUserId(userId)
import { mockPlayers, CURRENT_USER_ID } from "@/lib/mock-data"

export default function PlayerProfilePage() {
  const { userId } = useParams<{ userId: string }>()
  const player = mockPlayers.find((p) => p.userId === userId)

  if (!player) {
    return (
      <>
        <PageHeader title="Player Profile" />
        <div className="flex flex-1 items-center justify-center p-8">
          <p className="text-sm text-muted-foreground">Player not found</p>
        </div>
      </>
    )
  }

  const isOwnProfile = player.userId === CURRENT_USER_ID
  const winRate = player.matchesPlayed > 0
    ? ((player.wins / player.matchesPlayed) * 100).toFixed(1)
    : "0"

  return (
    <>
      <PageHeader title="Player Profile">
        <Button variant="ghost" size="sm" asChild>
          <Link to="/rankings">
            <ArrowLeft className="mr-1.5 h-4 w-4" /> Back
          </Link>
        </Button>
      </PageHeader>
      <div className="flex flex-1 flex-col gap-6 p-4 lg:p-8">
        {/* Profile Header */}
        <Card className="overflow-hidden border-border/50">
          <div className="border-b border-border/40 bg-primary/5 px-6 py-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-5">
                <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-primary/10 text-2xl font-bold text-primary">
                  {player.name.split(" ").map((n) => n[0]).join("")}
                </div>
                <div>
                  <h2 className="text-xl font-bold tracking-tight text-foreground">
                    {player.name}
                  </h2>
                  <div className="mt-1 flex items-center gap-3 text-sm text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <MapPin className="h-3.5 w-3.5" />
                      {player.city}
                    </span>
                    <span className="font-mono">
                      Level {player.levelValue.toFixed(1)}
                    </span>
                    <span className="font-mono text-xs">
                      ({Math.round(player.levelConfidence * 100)}% confidence)
                    </span>
                  </div>
                  <div className="mt-2 flex items-center gap-3">
                    <span className="font-mono text-2xl font-bold text-primary">
                      {player.levelValue.toFixed(1)}
                    </span>
                    <span className="text-sm text-muted-foreground">Level</span>
                  </div>
                </div>
              </div>
              {!isOwnProfile && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => toast.success(`Friend request sent to ${player.name}`)}
                >
                  <UserPlus className="mr-1.5 h-4 w-4" />
                  Add Friend
                </Button>
              )}
            </div>
          </div>
        </Card>

        {/* Stats */}
        <div className="grid gap-4 sm:grid-cols-3">
          <Card className="border-border/50">
            <CardContent className="flex items-center gap-4 p-4">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10">
                <Swords className="h-4 w-4 text-primary" />
              </div>
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
                  Matches
                </p>
                <p className="font-mono text-xl font-bold text-foreground">
                  {player.matchesPlayed}
                </p>
              </div>
            </CardContent>
          </Card>
          <Card className="border-border/50">
            <CardContent className="flex items-center gap-4 p-4">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10">
                <Target className="h-4 w-4 text-primary" />
              </div>
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
                  Win Rate
                </p>
                <p className="font-mono text-xl font-bold text-foreground">{winRate}%</p>
              </div>
            </CardContent>
          </Card>
          <Card className="border-border/50">
            <CardContent className="flex items-center gap-4 p-4">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10">
                <TrendingUp className="h-4 w-4 text-primary" />
              </div>
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
                  Record
                </p>
                <p className="font-mono text-xl font-bold text-foreground">
                  {player.wins}W - {player.losses}L
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  )
}
