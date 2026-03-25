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
import { useTranslation } from "@/lib/i18n/use-translation"
import { resultsService } from "@/lib/services/results.service"
import { getCurrentUserId } from "@/lib/current-user"

interface ResultUploadDialogProps {
  match: Match
  onResultSubmitted?: () => void
  trigger?: React.ReactNode
}

interface SetInput {
  id: string
  player1Score: string
  player2Score: string
  tiebreak1: string
  tiebreak2: string
}

type QuestionKey = keyof PostMatchQuestionnaire

const QUESTION_KEYS: QuestionKey[] = [
  "matchPlayedOut",
  "mainStrategy",
  "whatWorkedBest",
  "whatDidntWork",
  "generalSensation",
  "pointBuilding",
  "serveStrategy",
  "targetedSide",
  "tacticAdjustment",
  "importantPoints",
  "netApproach",
  "opponentStrength",
  "mainMistake",
]

const QUESTION_OPTIONS: Record<QuestionKey, string[]> = {
  matchPlayedOut:   ["dominated", "balanced", "very_close", "struggled"],
  mainStrategy:     ["baseline", "aggressive_forehand", "net_play", "defensive", "serve_focused", "mixed"],
  whatWorkedBest:   ["first_serve", "return", "forehand", "backhand", "movement", "mental"],
  whatDidntWork:    ["unforced_errors", "weak_second_serve", "positioning", "focus", "fatigue", "tactics"],
  generalSensation: ["confident", "nervous", "in_rhythm", "out_of_sync", "strong", "tired"],
  pointBuilding:    ["long_rallies", "short_aggressive", "serve_first_shot", "counter_attacking", "waiting_errors", "mixed"],
  serveStrategy:    ["high_percentage", "aggressive", "targeted_weakness", "body_serves", "wide_serves", "no_strategy"],
  targetedSide:     ["forehand", "backhand", "mixed", "no_targeting"],
  tacticAdjustment: ["yes_successful", "yes_unsuccessful", "no_adjustment", "no_plan"],
  importantPoints:  ["very_strong", "solid", "inconsistent", "struggled"],
  netApproach:      ["frequently", "occasionally", "rarely", "never"],
  opponentStrength: ["serve", "forehand", "backhand", "defense", "consistency", "mental", "endurance"],
  mainMistake:      ["forced_errors", "unforced_errors", "shot_selection", "predictable", "positioning", "second_serve"],
}

function isTiebreakSet(p1: string, p2: string) {
  const a = parseInt(p1)
  const b = parseInt(p2)
  return (a === 7 && b === 6) || (a === 6 && b === 7)
}

export function ResultUploadDialog({ match, onResultSubmitted, trigger }: ResultUploadDialogProps) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const [sets, setSets] = useState<SetInput[]>([
    { id: "set-1", player1Score: "", player2Score: "", tiebreak1: "", tiebreak2: "" },
    { id: "set-2", player1Score: "", player2Score: "", tiebreak1: "", tiebreak2: "" },
  ])
  const [questionnaireOpen, setQuestionnaireOpen] = useState(false)
  const [questionnaire, setQuestionnaire] = useState<Partial<PostMatchQuestionnaire>>({})
  const [isSubmitting, setIsSubmitting] = useState(false)

  const selectedQuestions = useMemo(() => {
    const shuffled = [...QUESTION_KEYS].sort(() => Math.random() - 0.5)
    return shuffled.slice(0, 5)
  }, [open])

  const currentUserId = getCurrentUserId()
  const isPlayer1 = match.player1.userId === currentUserId
  const currentPlayer = isPlayer1 ? match.player1 : match.player2
  const opponent = isPlayer1 ? match.player2 : match.player1

  // Abbreviated first name + last initial
  function abbrev(name: string) {
    const parts = name.trim().split(" ")
    if (parts.length === 1) return parts[0].slice(0, 10)
    return `${parts[0]} ${parts[parts.length - 1][0]}.`
  }

  function addSet() {
    if (sets.length < 5) {
      setSets([...sets, { id: `set-${Date.now()}`, player1Score: "", player2Score: "", tiebreak1: "", tiebreak2: "" }])
    }
  }

  function removeSet(id: string) {
    if (sets.length > 1) setSets(sets.filter((s) => s.id !== id))
  }

  function updateSet(id: string, field: keyof SetInput, value: string) {
    setSets(sets.map((s) => (s.id === id ? { ...s, [field]: value } : s)))
  }

  function calculateWinner() {
    const filled = sets.filter((s) => s.player1Score !== "" && s.player2Score !== "")
    if (filled.length === 0) return null
    let p1Sets = 0, p2Sets = 0
    filled.forEach((s) => {
      const p1 = parseInt(s.player1Score) || 0
      const p2 = parseInt(s.player2Score) || 0
      if (p1 > p2) p1Sets++
      else if (p2 > p1) p2Sets++
    })
    if (p1Sets > p2Sets) return currentPlayer.name
    if (p2Sets > p1Sets) return opponent.name
    return null
  }

  function validateSets(): string | null {
    const filled = sets.filter((s) => s.player1Score !== "" && s.player2Score !== "")
    if (filled.length < 1) return t("results.dialog.validation.required")
    for (const s of filled) {
      const p1 = parseInt(s.player1Score)
      const p2 = parseInt(s.player2Score)
      if (isNaN(p1) || isNaN(p2)) return t("results.dialog.validation.invalidScores")
      if (p1 < 0 || p2 < 0 || p1 > 7 || p2 > 7) return t("results.dialog.validation.scoreRange")
      if (p1 === p2) return t("results.dialog.validation.tied")
      const winner = Math.max(p1, p2)
      const loser = Math.min(p1, p2)
      if (winner < 6) return t("results.dialog.validation.minGames")
      if (winner === 6 && loser > 4) return t("results.dialog.validation.invalid6")
      if (winner === 7 && (loser < 5 || loser > 6)) return t("results.dialog.validation.invalid7")
    }
    return null
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const error = validateSets()
    if (error) { toast.error(error); return }

    const filled = sets.filter((s) => s.player1Score && s.player2Score)
    const setsPayload = filled.map((s, i) => {
      const tb = isTiebreakSet(s.player1Score, s.player2Score)
      return {
        setNumber: i + 1,
        player1Score: parseInt(s.player1Score),
        player2Score: parseInt(s.player2Score),
        tiebreak: tb,
        ...(tb && s.tiebreak1 && s.tiebreak2 ? {
          tiebreakScore1: parseInt(s.tiebreak1),
          tiebreakScore2: parseInt(s.tiebreak2),
        } : {}),
      }
    })

    setIsSubmitting(true)
    try {
      await resultsService.submitMatchResult(
        match.id,
        setsPayload,
        Object.keys(questionnaire).length > 0 ? questionnaire : undefined
      )
      toast.success(
        match.matchType === "competitive"
          ? t("results.dialog.submittedCompetitive")
          : t("results.dialog.submittedPractice")
      )
      setOpen(false)
      onResultSubmitted?.()
    } catch {
      toast.error(t("results.dialog.submitFailed"))
    } finally {
      setIsSubmitting(false)
    }
  }

  function toggleQuestionnaireValue(key: QuestionKey, value: string) {
    const current = (questionnaire[key] as string[]) || []
    const next = current.includes(value) ? current.filter((v) => v !== value) : [...current, value]
    setQuestionnaire({ ...questionnaire, [key]: next.length > 0 ? next : undefined })
  }

  const winner = calculateWinner()

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger || (
          <Button size="sm" variant="outline" className="gap-2">
            {t("matchDetails.submit.button")}
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle>{t("results.dialog.title")}</DialogTitle>
          <DialogDescription>
            {currentPlayer.name} vs {opponent.name}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Set Results */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label className="text-base font-semibold">{t("results.dialog.setResults")}</Label>
              {sets.length < 5 && (
                <Button type="button" size="sm" variant="outline" onClick={addSet}>
                  <Plus className="mr-1 h-3.5 w-3.5" />
                  {t("results.dialog.addSet")}
                </Button>
              )}
            </div>

            {/* Column headers */}
            <div className="grid grid-cols-[2.5rem_1fr_1.25rem_1fr_2rem] items-center gap-2 px-1">
              <span />
              <span className="text-center text-xs font-medium text-muted-foreground truncate">{abbrev(currentPlayer.name)}</span>
              <span />
              <span className="text-center text-xs font-medium text-muted-foreground truncate">{abbrev(opponent.name)}</span>
              <span />
            </div>

            {/* Set rows */}
            <div className="space-y-2">
              {sets.map((set, index) => {
                const showTb = isTiebreakSet(set.player1Score, set.player2Score)
                return (
                  <div key={set.id} className="space-y-1.5">
                    <div className="grid grid-cols-[2.5rem_1fr_1.25rem_1fr_2rem] items-center gap-2">
                      <span className="text-right text-sm text-muted-foreground pr-1">
                        {t("results.dialog.set")} {index + 1}
                      </span>
                      <Input
                        type="number"
                        min={0}
                        max={7}
                        value={set.player1Score}
                        onChange={(e) => updateSet(set.id, "player1Score", e.target.value)}
                        className="text-center"
                      />
                      <span className="text-center text-muted-foreground select-none">–</span>
                      <Input
                        type="number"
                        min={0}
                        max={7}
                        value={set.player2Score}
                        onChange={(e) => updateSet(set.id, "player2Score", e.target.value)}
                        className="text-center"
                      />
                      {sets.length > 1 ? (
                        <Button type="button" size="icon" variant="ghost" className="h-7 w-7" onClick={() => removeSet(set.id)}>
                          <X className="h-3.5 w-3.5" />
                        </Button>
                      ) : <span />}
                    </div>

                    {/* Tiebreak row */}
                    {showTb && (
                      <div className="grid grid-cols-[2.5rem_1fr_1.25rem_1fr_2rem] items-center gap-2">
                        <span className="text-right text-xs text-muted-foreground pr-1">
                          {t("results.dialog.tiebreak")}
                        </span>
                        <Input
                          type="number"
                          min={0}
                          value={set.tiebreak1}
                          onChange={(e) => updateSet(set.id, "tiebreak1", e.target.value)}
                          className="text-center text-xs h-8"
                          placeholder="e.g. 10"
                        />
                        <span className="text-center text-muted-foreground text-xs select-none">–</span>
                        <Input
                          type="number"
                          min={0}
                          value={set.tiebreak2}
                          onChange={(e) => updateSet(set.id, "tiebreak2", e.target.value)}
                          className="text-center text-xs h-8"
                          placeholder="e.g. 8"
                        />
                        <span />
                      </div>
                    )}
                  </div>
                )
              })}
            </div>

            {winner && (
              <div className="rounded-lg border border-primary/20 bg-primary/5 px-3 py-2">
                <p className="text-sm">
                  <span className="text-muted-foreground">{t("results.dialog.winnerPreview")}</span>{" "}
                  <span className="font-semibold text-primary">{winner}</span>
                </p>
              </div>
            )}
          </div>

          {/* Questionnaire */}
          <Collapsible open={questionnaireOpen} onOpenChange={setQuestionnaireOpen}>
            <div className="rounded-lg border border-border bg-muted/30">
              <CollapsibleTrigger className="flex w-full items-center justify-between p-4 hover:bg-muted/50">
                <div className="text-left">
                  <p className="text-sm font-semibold">{t("results.questionnaire.title")}</p>
                  <p className="text-xs text-muted-foreground">{t("results.questionnaire.subtitle")}</p>
                </div>
                {questionnaireOpen
                  ? <ChevronUp className="h-5 w-5 shrink-0 text-muted-foreground" />
                  : <ChevronDown className="h-5 w-5 shrink-0 text-muted-foreground" />
                }
              </CollapsibleTrigger>

              <CollapsibleContent className="space-y-4 border-t border-border p-4">
                <p className="text-xs text-muted-foreground">{t("results.questionnaire.disclaimer")}</p>
                {selectedQuestions.map((key) => (
                  <QuestionCheckboxGroup
                    key={key}
                    label={t(`results.questionnaire.${key}.label`)}
                    options={QUESTION_OPTIONS[key].map((v) => ({
                      value: v,
                      label: t(`results.questionnaire.${key}.${v}`),
                    }))}
                    selectedValues={(questionnaire[key] as string[]) || []}
                    onToggle={(value) => toggleQuestionnaireValue(key, value)}
                  />
                ))}
              </CollapsibleContent>
            </div>
          </Collapsible>

          <Button type="submit" className="w-full" size="lg" disabled={isSubmitting}>
            {isSubmitting ? t("results.dialog.submitting") : t("results.dialog.submitButton")}
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

function QuestionCheckboxGroup({ label, options, selectedValues, onToggle }: QuestionCheckboxGroupProps) {
  return (
    <div className="space-y-2.5">
      <Label className="text-sm font-medium">{label}</Label>
      <div className="grid grid-cols-2 gap-x-4 gap-y-2">
        {options.map((option) => (
          <div key={option.value} className="flex items-center gap-2">
            <Checkbox
              id={`${label}-${option.value}`}
              checked={selectedValues.includes(option.value)}
              onCheckedChange={() => onToggle(option.value)}
            />
            <label
              htmlFor={`${label}-${option.value}`}
              className="text-sm leading-tight peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
            >
              {option.label}
            </label>
          </div>
        ))}
      </div>
    </div>
  )
}
