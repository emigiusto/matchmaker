import { useState, useEffect } from "react"
import { Link, useParams } from "react-router-dom"
import {
  ArrowLeft,
  MapPin,
  TrendingUp,
  UserPlus,
  Swords,
  Target,
  Loader2,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { PageHeader } from "@/components/page-header"
import { toast } from "sonner"
import { playersService } from "@/lib/services/players.service"
import { getCurrentUserId } from "@/lib/current-user"
import type { Player } from "@/lib/types"
import { useTranslation } from "@/lib/i18n"

// Map backend PlayerDTO to frontend Player shape
function adaptPlayer(dto: Record<string, unknown>): Player {
  return {
    id: dto.id as string,
    userId: dto.userId as string,
    name: (dto.name ?? "Player") as string,
    city: (dto.defaultCity ?? dto.city ?? "") as string,
    latitude: (dto.latitude as number) ?? 0,
    longitude: (dto.longitude as number) ?? 0,
    levelValue: (dto.levelValue as number) ?? 0,
    levelConfidence: (dto.levelConfidence as number) ?? 0,
    rating: 0,
    matchesPlayed: 0,
    wins: 0,
    losses: 0,
    ...dto,
  }
}

export default function PlayerProfilePage() {
  const { userId } = useParams<{ userId: string }>()
  const currentUserId = getCurrentUserId()
  const { t } = useTranslation()
  const [player, setPlayer] = useState<Player | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!userId) {
      setLoading(false)
      return
    }
    playersService
      .getByUser(userId)
      .then((dto) => setPlayer(adaptPlayer(dto as unknown as Record<string, unknown>)))
      .catch(() => setPlayer(null))
      .finally(() => setLoading(false))
  }, [userId])

  if (loading) {
    return (
      <>
        <PageHeader title={t("profileView.title")} />
        <div className="flex flex-1 items-center justify-center p-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </>
    )
  }

  if (!player) {
    return (
      <>
        <PageHeader title={t("profileView.title")} />
        <div className="flex flex-1 items-center justify-center p-8">
          <p className="text-sm text-muted-foreground">{t("profileView.notFound")}</p>
        </div>
      </>
    )
  }

  const isOwnProfile = !!currentUserId && player.userId === currentUserId
  const winRate = player.matchesPlayed > 0
    ? ((player.wins / player.matchesPlayed) * 100).toFixed(1)
    : "0"

  return (
    <>
      <PageHeader title={t("profileView.title")}>
        <Button variant="ghost" size="sm" asChild>
          <Link to="/">
            <ArrowLeft className="mr-1.5 h-4 w-4" /> {t("common.back")}
          </Link>
        </Button>
      </PageHeader>
      <div className="flex flex-1 flex-col gap-6 p-4 lg:p-8">
        {/* Profile Header */}
        <Card className="overflow-hidden border-border/50">
          <div className="border-b border-border/40 bg-primary/5 px-6 py-6">
            <div className="flex items-start justify-between gap-3">
              <div className="flex min-w-0 items-center gap-4">
                <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-xl font-bold text-primary">
                  {player.name.split(" ").map((n) => n[0]).join("")}
                </div>
                <div className="min-w-0">
                  <h2 className="truncate text-lg font-bold tracking-tight text-foreground">
                    {player.name}
                  </h2>
                  <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-sm text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <MapPin className="h-3.5 w-3.5 shrink-0" />
                      {player.city}
                    </span>
                    <span className="font-mono">
                      Level {player.levelValue.toFixed(1)}
                    </span>
                    <span className="hidden font-mono text-xs sm:inline">
                      ({Math.round(player.levelConfidence * 100)}% confidence)
                    </span>
                  </div>
                  <div className="mt-1.5 flex items-center gap-2">
                    <span className="font-mono text-xl font-bold text-primary">
                      {player.levelValue.toFixed(1)}
                    </span>
                    <span className="text-sm text-muted-foreground">{t("common.level")}</span>
                  </div>
                </div>
              </div>
              {!isOwnProfile && (
                <Button
                  size="sm"
                  variant="outline"
                  className="shrink-0"
                  onClick={() => toast.success(`Friend request sent to ${player.name}`)}
                >
                  <UserPlus className="mr-1.5 h-4 w-4" />
                  {t("profileView.addFriend")}
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
                  {t("profileView.matches")}
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
                  {t("profileView.winRate")}
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
                  {t("profileView.record")}
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
