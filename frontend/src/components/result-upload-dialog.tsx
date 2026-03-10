import { useState, useMemo } from "react"
import { Plus, X, ChevronDown, ChevronUp } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { toast } from "sonner"
import type { Match, PostMatchQuestionnaire } from "@/lib/types"

interface ResultUploadDialogProps {
  match: Match
  onResultSubmitted?: () => void
  trigger?: React.ReactNode
}

interface SetInput {
  id: string
  player1Score: string
  player2Score: string
}

interface QuestionDefinition {
  key: keyof PostMatchQuestionnaire
  label: string
  options: { value: string; label: string }[]
}

const ALL_QUESTIONS: QuestionDefinition[] = [
  {
    key: "matchPlayedOut",
    label: "How did the match play out?",
    options: [
      { value: "dominated", label: "I dominated" },
      { value: "balanced", label: "Balanced" },
      { value: "very_close", label: "Very close" },
      { value: "struggled", label: "I struggled" },
    ],
  },
  {
    key: "mainStrategy",
    label: "Main strategy used?",
    options: [
      { value: "baseline", label: "Baseline consistency" },
      { value: "aggressive_forehand", label: "Aggressive forehand" },
      { value: "net_play", label: "Net play" },
      { value: "defensive", label: "Defensive counterplay" },
      { value: "serve_focused", label: "Serve-focused" },
      { value: "mixed", label: "Mixed" },
    ],
  },
  {
    key: "whatWorkedBest",
    label: "What worked best?",
    options: [
      { value: "first_serve", label: "First serve" },
      { value: "return", label: "Return" },
      { value: "forehand", label: "Forehand" },
      { value: "backhand", label: "Backhand" },
      { value: "movement", label: "Movement" },
      { value: "mental", label: "Mental resilience" },
    ],
  },
  {
    key: "whatDidntWork",
    label: "What didn't work?",
    options: [
      { value: "unforced_errors", label: "Too many unforced errors" },
      { value: "weak_second_serve", label: "Weak second serve" },
      { value: "positioning", label: "Poor positioning" },
      { value: "focus", label: "Lost focus" },
      { value: "fatigue", label: "Physical fatigue" },
      { value: "tactics", label: "Tactical mistakes" },
    ],
  },
  {
    key: "generalSensation",
    label: "General sensations?",
    options: [
      { value: "confident", label: "High confidence" },
      { value: "nervous", label: "Nervous" },
      { value: "in_rhythm", label: "In rhythm" },
      { value: "out_of_sync", label: "Out of sync" },
      { value: "strong", label: "Physically strong" },
      { value: "tired", label: "Physically tired" },
    ],
  },
  {
    key: "pointBuilding",
    label: "How did you build most points?",
    options: [
      { value: "long_rallies", label: "Long rallies (5+ shots)" },
      { value: "short_aggressive", label: "Short aggressive points" },
      { value: "serve_first_shot", label: "Serve + first shot" },
      { value: "counter_attacking", label: "Counter-attacking" },
      { value: "waiting_errors", label: "Waiting for errors" },
      { value: "mixed", label: "Mixed" },
    ],
  },
  {
    key: "serveStrategy",
    label: "Serve strategy?",
    options: [
      { value: "high_percentage", label: "High percentage" },
      { value: "aggressive", label: "Aggressive" },
      { value: "targeted_weakness", label: "Targeted weakness" },
      { value: "body_serves", label: "Body serves" },
      { value: "wide_serves", label: "Wide serves" },
      { value: "no_strategy", label: "No clear strategy" },
    ],
  },
  {
    key: "targetedSide",
    label: "Did you target a specific side?",
    options: [
      { value: "forehand", label: "Mostly forehand" },
      { value: "backhand", label: "Mostly backhand" },
      { value: "mixed", label: "Mixed" },
      { value: "no_targeting", label: "No targeting" },
    ],
  },
  {
    key: "tacticAdjustment",
    label: "Did you adjust tactics mid-match?",
    options: [
      { value: "yes_successful", label: "Yes, successfully" },
      { value: "yes_unsuccessful", label: "Yes, unsuccessfully" },
      { value: "no_adjustment", label: "No adjustment" },
      { value: "no_plan", label: "No clear plan" },
    ],
  },
  {
    key: "importantPoints",
    label: "How did you perform in important points?",
    options: [
      { value: "very_strong", label: "Very strong" },
      { value: "solid", label: "Solid" },
      { value: "inconsistent", label: "Inconsistent" },
      { value: "struggled", label: "Struggled" },
    ],
  },
  {
    key: "netApproach",
    label: "How often did you approach the net?",
    options: [
      { value: "frequently", label: "Frequently" },
      { value: "occasionally", label: "Occasionally" },
      { value: "rarely", label: "Rarely" },
      { value: "never", label: "Never" },
    ],
  },
  {
    key: "opponentStrength",
    label: "What was opponent's biggest strength?",
    options: [
      { value: "serve", label: "Serve" },
      { value: "forehand", label: "Forehand" },
      { value: "backhand", label: "Backhand" },
      { value: "defense", label: "Defense" },
      { value: "consistency", label: "Consistency" },
      { value: "mental", label: "Mental strength" },
      { value: "endurance", label: "Endurance" },
    ],
  },
  {
    key: "mainMistake",
    label: "Main tactical mistake?",
    options: [
      { value: "forced_errors", label: "Forced errors" },
      { value: "unforced_errors", label: "Unforced errors" },
      { value: "shot_selection", label: "Poor shot selection" },
      { value: "predictable", label: "Predictable patterns" },
      { value: "positioning", label: "Positioning" },
      { value: "second_serve", label: "Second serve weakness" },
    ],
  },
]

export function ResultUploadDialog({ match, onResultSubmitted, trigger }: ResultUploadDialogProps) {
  const [open, setOpen] = useState(false)
  const [sets, setSets] = useState<SetInput[]>([
    { id: "set-1", player1Score: "", player2Score: "" },
    { id: "set-2", player1Score: "", player2Score: "" },
  ])
  const [questionnaireOpen, setQuestionnaireOpen] = useState(false)
  const [questionnaire, setQuestionnaire] = useState<Partial<PostMatchQuestionnaire>>({})

  // Pick 5 random questions on mount (only when dialog opens)
  const selectedQuestions = useMemo(() => {
    const shuffled = [...ALL_QUESTIONS].sort(() => Math.random() - 0.5)
    return shuffled.slice(0, 5)
  }, [open])

  const isPlayer1 = match.player1.userId === "user-001"
  const currentPlayer = isPlayer1 ? match.player1 : match.player2
  const opponent = isPlayer1 ? match.player2 : match.player1

  function addSet() {
    if (sets.length < 5) {
      setSets([...sets, { id: `set-${Date.now()}`, player1Score: "", player2Score: "" }])
    }
  }

  function removeSet(id: string) {
    if (sets.length > 1) {
      setSets(sets.filter((s) => s.id !== id))
    }
  }

  function updateSet(id: string, field: "player1Score" | "player2Score", value: string) {
    setSets(sets.map((s) => (s.id === id ? { ...s, [field]: value } : s)))
  }

  function calculateWinner() {
    const filledSets = sets.filter(
      (s) => s.player1Score.trim() !== "" && s.player2Score.trim() !== ""
    )
    if (filledSets.length === 0) return "Undecided"

    let player1Sets = 0
    let player2Sets = 0
    filledSets.forEach((set) => {
      const p1 = parseInt(set.player1Score) || 0
      const p2 = parseInt(set.player2Score) || 0
      if (p1 > p2) player1Sets++
      else if (p2 > p1) player2Sets++
    })
    if (player1Sets > player2Sets) return currentPlayer.name
    if (player2Sets > player1Sets) return opponent.name
    return "Undecided"
  }

  function validateSets() {
    const filledSets = sets.filter(
      (s) => s.player1Score.trim() !== "" && s.player2Score.trim() !== ""
    )
    if (filledSets.length < 1) {
      return "At least 1 set is required"
    }
    for (const set of filledSets) {
      const p1 = parseInt(set.player1Score)
      const p2 = parseInt(set.player2Score)
      if (isNaN(p1) || isNaN(p2)) {
        return "All filled sets must have valid scores"
      }
      if (p1 < 0 || p2 < 0 || p1 > 7 || p2 > 7) {
        return "Scores must be between 0 and 7"
      }
      if (p1 === p2) {
        return "Sets cannot be tied"
      }
      // Basic tennis validation: winner must have at least 6 games
      const winner = Math.max(p1, p2)
      const loser = Math.min(p1, p2)
      if (winner < 6) {
        return "Winner must have at least 6 games"
      }
      // If winner has 6, loser must be <= 4, or it's a tiebreak at 7-6
      if (winner === 6 && loser > 4) {
        return "Invalid score: if winner has 6, loser must have 4 or less"
      }
      // If winner has 7, loser must be 5 or 6
      if (winner === 7 && loser < 5) {
        return "Invalid score: if winner has 7, loser must be 5 or 6"
      }
    }
    return null
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()

    const validationError = validateSets()
    if (validationError) {
      toast.error(validationError)
      return
    }

    const winner = calculateWinner()
    if (winner === "Undecided") {
      toast.error("Match result is undecided - please enter valid scores")
      return
    }

    const filledSets = sets.filter((s) => s.player1Score && s.player2Score)

    console.log("[v0] Submitting result:", {
      matchId: match.id,
      sets: filledSets,
      winner,
      questionnaire,
    })

    toast.success(
      match.matchType === "competitive"
        ? "Result submitted! Awaiting opponent confirmation."
        : "Result submitted successfully!"
    )
    setOpen(false)
    onResultSubmitted?.()
  }

  function toggleQuestionnaireValue(key: keyof PostMatchQuestionnaire, value: string) {
    const currentValues = (questionnaire[key] as string[]) || []
    const newValues = currentValues.includes(value)
      ? currentValues.filter((v) => v !== value)
      : [...currentValues, value]
    setQuestionnaire({ ...questionnaire, [key]: newValues.length > 0 ? newValues : undefined })
  }

  const winner = calculateWinner()

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger || (
          <Button size="sm" className="gap-2">
            Upload Result
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle>Upload Match Result</DialogTitle>
          <DialogDescription>
            {currentPlayer.name} vs {opponent.name}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Set Results Section */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <Label className="text-base font-semibold">Set Results</Label>
              {sets.length < 5 && (
                <Button type="button" size="sm" variant="outline" onClick={addSet}>
                  <Plus className="mr-1.5 h-4 w-4" />
                  Add Set
                </Button>
              )}
            </div>

            <div className="space-y-3">
              {sets.map((set, index) => (
                <div key={set.id} className="flex items-center gap-3">
                  <span className="w-12 text-sm text-muted-foreground">Set {index + 1}</span>
                  <div className="flex flex-1 items-center gap-2">
                    <Input
                      type="number"
                      min={0}
                      max={7}
                      value={set.player1Score}
                      onChange={(e) => updateSet(set.id, "player1Score", e.target.value)}
                      placeholder={currentPlayer.name.split(" ")[0]}
                      className="w-20"
                    />
                    <span className="text-muted-foreground">-</span>
                    <Input
                      type="number"
                      min={0}
                      max={7}
                      value={set.player2Score}
                      onChange={(e) => updateSet(set.id, "player2Score", e.target.value)}
                      placeholder={opponent.name.split(" ")[0]}
                      className="w-20"
                    />
                  </div>
                  {sets.length > 1 && (
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      onClick={() => removeSet(set.id)}
                      className="shrink-0"
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              ))}
            </div>

            {winner !== "Undecided" && (
              <div className="rounded-lg border border-primary/20 bg-primary/5 p-3">
                <p className="text-sm">
                  <span className="text-muted-foreground">Winner Preview:</span>{" "}
                  <span className="font-semibold text-primary">{winner}</span>
                </p>
              </div>
            )}
          </div>

          {/* Optional Post-Match Questionnaire */}
          <Collapsible open={questionnaireOpen} onOpenChange={setQuestionnaireOpen}>
            <div className="rounded-lg border border-border bg-muted/30">
              <CollapsibleTrigger className="flex w-full items-center justify-between p-4 hover:bg-muted/50">
                <div className="text-left">
                  <p className="text-sm font-semibold">Optional: Improve your match insights</p>
                  <p className="text-xs text-muted-foreground">
                    5 quick questions (select all that apply)
                  </p>
                </div>
                {questionnaireOpen ? (
                  <ChevronUp className="h-5 w-5 text-muted-foreground" />
                ) : (
                  <ChevronDown className="h-5 w-5 text-muted-foreground" />
                )}
              </CollapsibleTrigger>

              <CollapsibleContent className="space-y-4 border-t border-border p-4">
                {selectedQuestions.map((question) => (
                  <QuestionCheckboxGroup
                    key={question.key}
                    label={question.label}
                    options={question.options}
                    selectedValues={(questionnaire[question.key] as string[]) || []}
                    onToggle={(value) => toggleQuestionnaireValue(question.key, value)}
                  />
                ))}
              </CollapsibleContent>
            </div>
          </Collapsible>

          <Button type="submit" className="w-full" size="lg">
            Submit Result
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  )
}

interface QuestionCheckboxGroupProps {
  label: string
  options: { value: string; label: string }[]
  selectedValues: string[]
  onToggle: (value: string) => void
}

function QuestionCheckboxGroup({
  label,
  options,
  selectedValues,
  onToggle,
}: QuestionCheckboxGroupProps) {
  return (
    <div className="space-y-3">
      <Label className="text-sm font-medium">{label}</Label>
      <div className="space-y-2">
        {options.map((option) => (
          <div key={option.value} className="flex items-center space-x-2">
            <Checkbox
              id={`${label}-${option.value}`}
              checked={selectedValues.includes(option.value)}
              onCheckedChange={() => onToggle(option.value)}
            />
            <label
              htmlFor={`${label}-${option.value}`}
              className="text-sm leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
            >
              {option.label}
            </label>
          </div>
        ))}
      </div>
    </div>
  )
}
