import { useState, useEffect } from "react"
import { Slider } from "@/components/ui/slider"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { PageHeader } from "@/components/page-header"
import { SuggestionCard } from "@/components/suggestion-card"
import { SlidersHorizontal, Loader2 } from "lucide-react"
import { matchmakingService } from "@/lib/services/matchmaking.service"
import { getCurrentUserId } from "@/lib/current-user"
import type { SuggestedOpponent } from "@/lib/types"

export default function SuggestedOpponentsPage() {
  const currentUserId = getCurrentUserId()
  const [distanceRadius, setDistanceRadius] = useState([10])
  const [levelRange, setLevelRange] = useState([2.0, 6.0])
  const [suggestions, setSuggestions] = useState<SuggestedOpponent[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      setError(null)
      try {
        const data = await matchmakingService.getSuggestions(currentUserId)
        if (!cancelled) setSuggestions(data)
      } catch {
        if (!cancelled) setError("Failed to load suggestions. Please try again.")
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [currentUserId])

  const filtered = suggestions.filter((s) => {
    const matchDist = s.distance <= distanceRadius[0]
    const matchLevel =
      s.player.levelValue >= levelRange[0] && s.player.levelValue <= levelRange[1]
    return matchDist && matchLevel
  })

  return (
    <>
      <PageHeader
        title="Suggested Opponents"
        description="Players matched to your level and availability"
      />
      <div className="flex flex-1 flex-col gap-6 p-4 lg:p-8">
        <div className="grid gap-6 lg:grid-cols-4">
          {/* Filters Sidebar */}
          <Card className="border-border/50 lg:col-span-1">
            <CardHeader className="pb-4">
              <CardTitle className="flex items-center gap-2 text-sm font-semibold tracking-tight">
                <SlidersHorizontal className="h-4 w-4 text-primary" />
                Filters
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="space-y-3">
                <Label className="text-xs font-medium">
                  Distance: {distanceRadius[0]} km
                </Label>
                <Slider
                  min={1}
                  max={50}
                  step={1}
                  value={distanceRadius}
                  onValueChange={setDistanceRadius}
                />
              </div>
              <div className="space-y-3">
                <Label className="text-xs font-medium">
                  Level: {levelRange[0].toFixed(1)} - {levelRange[1].toFixed(1)}
                </Label>
                <Slider
                  min={1}
                  max={7}
                  step={0.5}
                  value={levelRange}
                  onValueChange={setLevelRange}
                />
              </div>
            </CardContent>
          </Card>

          {/* Results */}
          <div className="lg:col-span-3">
            {loading ? (
              <Card className="border-border/50">
                <CardContent className="flex items-center justify-center py-16">
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </CardContent>
              </Card>
            ) : error ? (
              <Card className="border-border/50">
                <CardContent className="py-16 text-center">
                  <p className="text-sm text-destructive">{error}</p>
                </CardContent>
              </Card>
            ) : (
              <>
                <p className="mb-4 text-sm text-muted-foreground">
                  {filtered.length} player{filtered.length !== 1 ? "s" : ""} found
                </p>
                {filtered.length === 0 ? (
                  <Card className="border-border/50">
                    <CardContent className="py-16 text-center">
                      <p className="text-sm text-muted-foreground">
                        No opponents match your filters. Try widening your search criteria.
                      </p>
                    </CardContent>
                  </Card>
                ) : (
                  <div className="grid gap-4 sm:grid-cols-2">
                    {filtered.map((suggestion) => (
                      <SuggestionCard
                        key={suggestion.player.id}
                        suggestion={suggestion}
                      />
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </>
  )
}
