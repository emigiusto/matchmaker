import { useState, useEffect, useCallback } from "react"
import { Slider } from "@/components/ui/slider"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { PageHeader } from "@/components/page-header"
import { SuggestionCard } from "@/components/suggestion-card"
import { SlidersHorizontal, Loader2, CalendarPlus } from "lucide-react"
import { matchmakingService } from "@/lib/services/matchmaking.service"
import { getCurrentUserId } from "@/lib/current-user"
import { Link } from "react-router-dom"
import type { SuggestedOpponent } from "@/lib/types"

export default function SuggestedOpponentsPage() {
  const currentUserId = getCurrentUserId()
  const [distanceRadius, setDistanceRadius] = useState([10])
  const [levelRange, setLevelRange] = useState([700, 1600])
  const [suggestions, setSuggestions] = useState<SuggestedOpponent[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await matchmakingService.getAllSuggestions({
        userId: currentUserId,
        distanceRadius: distanceRadius[0],
        levelRangeMin: levelRange[0],
        levelRangeMax: levelRange[1],
      })
      setSuggestions(data)
    } catch {
      setError("Failed to load suggestions. Please try again.")
    } finally {
      setLoading(false)
    }
  }, [currentUserId, distanceRadius, levelRange])

  useEffect(() => {
    load()
  }, [load])

  return (
    <>
      <PageHeader
        title="Suggested Opponents"
        description="Players matched to your level and location"
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
                  ELO: {levelRange[0]} – {levelRange[1]}
                </Label>
                <Slider
                  min={600}
                  max={2000}
                  step={50}
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
            ) : suggestions.length === 0 ? (
              <Card className="border-border/50">
                <CardContent className="flex flex-col items-center gap-4 py-16 text-center">
                  <p className="text-sm text-muted-foreground">
                    No opponents found nearby. Try widening your filters or publish your availability to improve your matches.
                  </p>
                  <Button variant="outline" asChild>
                    <Link to="/availability/new">
                      <CalendarPlus className="mr-2 h-4 w-4" />
                      Set availability
                    </Link>
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <>
                <p className="mb-4 text-sm text-muted-foreground">
                  {suggestions.length} player{suggestions.length !== 1 ? "s" : ""} found
                </p>
                <div className="grid gap-4 sm:grid-cols-2">
                  {suggestions.map((suggestion) => (
                    <SuggestionCard
                      key={suggestion.player.id}
                      suggestion={suggestion}
                    />
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </>
  )
}
