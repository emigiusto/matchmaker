import { useState } from "react"
import { Link } from "react-router-dom"
import { Search, TrendingUp } from "lucide-react"
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
// TODO: wire to API — replace with playersService (rankings endpoint)
import { mockPlayers, CURRENT_USER_ID } from "@/lib/mock-data"

export default function RankingsPage() {
  const [search, setSearch] = useState("")
  const [cityFilter, setCityFilter] = useState("all")

  const sorted = [...mockPlayers].sort((a, b) => b.levelValue - a.levelValue)
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
              <SelectItem value="Barcelona">Barcelona</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Rankings Table */}
        <div className="space-y-3">
          {filtered.map((player, index) => {
            const rank = index + 1
            const isCurrentUser = player.userId === CURRENT_USER_ID
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
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <p className="text-base font-semibold text-foreground">{player.name}</p>
                        {isCurrentUser && (
                          <span className="rounded-lg bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                            You
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {player.city} &middot; {player.matchesPlayed} matches &middot;{" "}
                        {((player.wins / player.matchesPlayed) * 100).toFixed(0)}% win rate
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="font-mono text-2xl font-bold text-foreground">{player.levelValue.toFixed(1)}</p>
                      <div className="flex items-center justify-end gap-1 text-sm text-muted-foreground">
                        <TrendingUp className="h-3.5 w-3.5" />
                        <span>
                          Confidence {Math.round(player.levelConfidence * 100)}%
                        </span>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            )
          })}
        </div>
      </div>
    </>
  )
}
