import { useState, useEffect, useMemo } from "react"
import { Link } from "react-router-dom"
import { Search, TrendingUp, Loader2 } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Card, CardContent } from "@/components/ui/card"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { PageHeader } from "@/components/page-header"
import { playersService } from "@/lib/services/players.service"
import { getCurrentUserId } from "@/lib/current-user"
import type { Player } from "@/lib/types"

export default function RankingsPage() {
  const currentUserId = getCurrentUserId()
  const [players, setPlayers] = useState<Player[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState("")
  const [cityFilter, setCityFilter] = useState("all")

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      setError(null)
      try {
        const data = await playersService.getAll()
        if (!cancelled) setPlayers(data)
      } catch {
        if (!cancelled) setError("Failed to load rankings.")
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [])

  const cities = useMemo(
    () => Array.from(new Set(players.map((p) => p.city).filter(Boolean))).sort(),
    [players]
  )

  const sorted = [...players].sort((a, b) => b.levelValue - a.levelValue)
  const filtered = sorted.filter((p) => {
    const matchSearch = p.name.toLowerCase().includes(search.toLowerCase())
    const matchCity = cityFilter === "all" || p.city === cityFilter
    return matchSearch && matchCity
  })

  return (
    <>
      <PageHeader title="Rankings" description="Player leaderboard" />
      <div className="flex flex-1 flex-col gap-6 p-5 lg:p-8">
        {/* Filters */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search players..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-11 text-base"
            />
          </div>
          <Select value={cityFilter} onValueChange={setCityFilter}>
            <SelectTrigger className="w-full text-base sm:w-44">
              <SelectValue placeholder="City" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Cities</SelectItem>
              {cities.map((city) => (
                <SelectItem key={city} value={city}>
                  {city}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Rankings Table */}
        {loading ? (
          <Card>
            <CardContent className="flex items-center justify-center py-20">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </CardContent>
          </Card>
        ) : error ? (
          <Card>
            <CardContent className="py-20 text-center">
              <p className="text-sm text-destructive">{error}</p>
            </CardContent>
          </Card>
        ) : filtered.length === 0 ? (
          <Card>
            <CardContent className="py-20 text-center">
              <p className="text-sm text-muted-foreground">No players found.</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {filtered.map((player, index) => {
              const rank = index + 1
              const isCurrentUser = player.userId === currentUserId
              return (
                <Link key={player.id} to={`/profile/${player.userId}`}>
                  <Card
                    className={`transition-all hover:shadow-lg ${
                      isCurrentUser ? "border-primary/30 bg-primary/5" : ""
                    }`}
                  >
                    <CardContent className="flex items-center gap-5 p-5">
                      <div
                        className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl font-mono text-base font-bold ${
                          rank === 1
                            ? "bg-primary text-primary-foreground"
                            : rank <= 3
                              ? "bg-primary/10 text-primary"
                              : "bg-muted text-muted-foreground"
                        }`}
                      >
                        {rank}
                      </div>
                      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-primary/10 text-base font-bold text-primary">
                        {player.name.split(" ").map((n) => n[0]).join("")}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex min-w-0 items-center gap-2">
                          <p className="truncate text-sm font-semibold text-foreground">{player.name}</p>
                          {isCurrentUser && (
                            <span className="shrink-0 rounded-lg bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                              You
                            </span>
                          )}
                        </div>
                        <p className="truncate text-xs text-muted-foreground">
                          {player.city} &middot; {player.matchesPlayed} matches &middot;{" "}
                          {player.matchesPlayed > 0
                            ? ((player.wins / player.matchesPlayed) * 100).toFixed(0)
                            : 0}% win rate
                        </p>
                      </div>
                      <div className="shrink-0 text-right">
                        <p className="font-mono text-xl font-bold text-foreground">{player.levelValue.toFixed(1)}</p>
                        <div className="hidden items-center justify-end gap-1 text-xs text-muted-foreground sm:flex">
                          <TrendingUp className="h-3 w-3" />
                          <span>{Math.round(player.levelConfidence * 100)}%</span>
                        </div>
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
