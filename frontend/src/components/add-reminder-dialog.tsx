import { useState } from "react"
import { format, parseISO } from "date-fns"
import { es as esLocale } from "date-fns/locale"
import { Bell, Calendar as CalendarIcon, Clock, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Calendar } from "@/components/ui/calendar"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { toast } from "sonner"
import { cn } from "@/lib/utils"
import { remindersService } from "@/lib/services/reminders.service"
import { useTranslation } from "@/lib/i18n/use-translation"

interface AddReminderDialogProps {
  matchId: string
  matchDate: string
  matchTime: string
  opponent: string
  location: string
  /** User ID setting the reminder (must be match participant) */
  userId: string
  /** Render prop for the trigger button so we can customise appearance per context */
  trigger?: React.ReactNode
  /** Called after a reminder is successfully created */
  onSuccess?: () => void
}

type ReminderMode = "preset" | "relative" | "exact"

const presetValues = ["30m", "1h", "2h", "6h", "12h", "24h", "2d", "1w"] as const
type PresetValue = (typeof presetValues)[number]

const presetI18nKeys: Record<PresetValue, string> = {
  "30m": "matchDetails.reminders.preset30m",
  "1h":  "matchDetails.reminders.preset1h",
  "2h":  "matchDetails.reminders.preset2h",
  "6h":  "matchDetails.reminders.preset6h",
  "12h": "matchDetails.reminders.preset12h",
  "24h": "matchDetails.reminders.preset24h",
  "2d":  "matchDetails.reminders.preset2d",
  "1w":  "matchDetails.reminders.preset1w",
}

const presetToMs: Record<string, number> = {
  "30m": 30 * 60 * 1000,
  "1h": 60 * 60 * 1000,
  "2h": 2 * 60 * 60 * 1000,
  "6h": 6 * 60 * 60 * 1000,
  "12h": 12 * 60 * 60 * 1000,
  "24h": 24 * 60 * 60 * 1000,
  "2d": 2 * 24 * 60 * 60 * 1000,
  "1w": 7 * 24 * 60 * 60 * 1000,
}

export function AddReminderDialog({
  matchId,
  matchDate,
  matchTime,
  opponent,
  location,
  userId,
  trigger,
  onSuccess,
}: AddReminderDialogProps) {
  const { t, language } = useTranslation()
  const dateLocale = language === "es" ? esLocale : undefined
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [mode, setMode] = useState<ReminderMode>("preset")
  const [selectedPreset, setSelectedPreset] = useState<PresetValue>("24h")

  // Relative custom
  const [relativeAmount, setRelativeAmount] = useState<string>("3")
  const [relativeUnit, setRelativeUnit] = useState<"hours" | "days">("hours")

  // Exact date/time
  const [exactDate, setExactDate] = useState<Date | undefined>(undefined)
  const [exactTime, setExactTime] = useState("")

  function resetForm() {
    setMode("preset")
    setSelectedPreset("24h")
    setRelativeAmount("3")
    setRelativeUnit("hours")
    setExactDate(undefined)
    setExactTime("")
  }

  function getReminderLabel(): string {
    if (mode === "preset") {
      return t(presetI18nKeys[selectedPreset], selectedPreset)
    }
    if (mode === "relative") {
      const amount = parseInt(relativeAmount) || 0
      return `${amount} ${relativeUnit} ${t("matchDetails.reminders.before")}`
    }
    if (mode === "exact" && exactDate && exactTime) {
      return `${format(exactDate, "MMM d", { locale: dateLocale })} at ${exactTime}`
    }
    return t("matchDetails.reminders.custom")
  }

  function getMatchDateTime(): Date {
    const firstTime = matchTime.split(/\s/)[0] || matchTime || "12:00"
    const [h, m] = firstTime.split(":").map((n) => parseInt(n, 10) || 0)
    return new Date(matchDate + `T${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:00`)
  }

  function computeScheduledAt(): string {
    const matchDt = getMatchDateTime()
    if (mode === "preset") {
      const ms = presetToMs[selectedPreset] ?? 24 * 60 * 60 * 1000
      return new Date(matchDt.getTime() - ms).toISOString()
    }
    if (mode === "relative") {
      const amount = parseInt(relativeAmount, 10) || 1
      const factor = relativeUnit === "hours" ? amount * 60 * 60 * 1000 : amount * 24 * 60 * 60 * 1000
      return new Date(matchDt.getTime() - factor).toISOString()
    }
    if (mode === "exact" && exactDate && exactTime) {
      const [h, m] = exactTime.split(":").map((n) => parseInt(n, 10) || 0)
      const d = new Date(exactDate)
      d.setHours(h, m, 0, 0)
      return d.toISOString()
    }
    throw new Error("Invalid reminder configuration")
  }

  async function handleCreate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const label = getReminderLabel()
    setLoading(true)
    try {
      const scheduledAt = computeScheduledAt()
      await remindersService.create({ userId, matchId, scheduledAt })
      toast.success(t("matchDetails.reminders.successToast", { label, opponent }))
      setOpen(false)
      resetForm()
      onSuccess?.()
    } catch (err) {
      let msg = t("matchDetails.reminders.failedToSet")
      if (err instanceof Error) {
        try {
          const parsed = JSON.parse(err.message) as { error?: string }
          msg = parsed.error ?? err.message
        } catch {
          msg = err.message
        }
      }
      toast.error(msg)
    } finally {
      setLoading(false)
    }
  }

  function getScheduledDate(): Date | null {
    try {
      return new Date(computeScheduledAt())
    } catch {
      return null
    }
  }

  const scheduledDate = getScheduledDate()
  const isScheduledInPast = scheduledDate !== null && scheduledDate <= new Date()

  const canSubmit =
    !isScheduledInPast &&
    (mode === "preset" ||
    (mode === "relative" && parseInt(relativeAmount) > 0) ||
    (mode === "exact" && exactDate && exactTime))

  return (
    <Dialog open={open} onOpenChange={(val) => { setOpen(val); if (!val) resetForm() }}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button
            variant="ghost"
            size="sm"
            className="gap-1.5 text-muted-foreground hover:text-primary"
          >
            <Bell className="h-4 w-4" />
            <span className="hidden sm:inline">{t("matchDetails.reminders.remindMe")}</span>
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold tracking-tight">
            {t("matchDetails.reminders.addReminder")}
          </DialogTitle>
        </DialogHeader>

        {/* Match summary */}
        <div className="rounded-2xl border border-border/40 bg-muted/30 p-4">
          <p className="text-base font-semibold text-foreground">
            vs {opponent}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            {format(parseISO(matchDate), "EEEE, MMM d", { locale: dateLocale })} at {matchTime} &middot; {location}
          </p>
        </div>

        {/* Mode selector */}
        <div className="flex gap-2">
          {([
            { key: "preset", label: t("matchDetails.reminders.quick") },
            { key: "relative", label: t("matchDetails.reminders.custom") },
            { key: "exact", label: t("matchDetails.reminders.exact") },
          ] as const).map((m) => (
            <button
              key={m.key}
              type="button"
              onClick={() => setMode(m.key)}
              className={cn(
                "flex-1 rounded-xl border-2 py-2.5 text-sm font-medium transition-all",
                mode === m.key
                  ? "border-primary bg-primary/5 text-primary"
                  : "border-border/50 text-foreground hover:border-primary/30"
              )}
            >
              {m.label}
            </button>
          ))}
        </div>

        <form onSubmit={handleCreate} className="space-y-5">
          {/* Preset mode */}
          {mode === "preset" && (
            <div className="space-y-2">
              <Label className="text-base font-medium">{t("matchDetails.reminders.whenToRemind")}</Label>
              <div className="grid grid-cols-2 gap-2">
                {presetValues.map((value) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setSelectedPreset(value)}
                    className={cn(
                      "rounded-xl border px-3 py-2.5 text-sm transition-all",
                      selectedPreset === value
                        ? "border-primary bg-primary/10 font-medium text-primary"
                        : "border-border/50 text-foreground hover:border-primary/30"
                    )}
                  >
                    {t(presetI18nKeys[value])}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Relative mode */}
          {mode === "relative" && (
            <div className="space-y-3">
              <Label className="text-base font-medium">{t("matchDetails.reminders.remindMeLabel")}</Label>
              <div className="flex items-center gap-3">
                <Input
                  type="number"
                  min={1}
                  max={999}
                  value={relativeAmount}
                  onChange={(e) => setRelativeAmount(e.target.value)}
                  className="w-24 text-center text-base"
                />
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setRelativeUnit("hours")}
                    className={cn(
                      "rounded-xl border-2 px-4 py-2.5 text-sm font-medium transition-all",
                      relativeUnit === "hours"
                        ? "border-primary bg-primary/5 text-primary"
                        : "border-border/50 text-foreground hover:border-primary/30"
                    )}
                  >
                    {t("matchDetails.reminders.hours")}
                  </button>
                  <button
                    type="button"
                    onClick={() => setRelativeUnit("days")}
                    className={cn(
                      "rounded-xl border-2 px-4 py-2.5 text-sm font-medium transition-all",
                      relativeUnit === "days"
                        ? "border-primary bg-primary/5 text-primary"
                        : "border-border/50 text-foreground hover:border-primary/30"
                    )}
                  >
                    {t("matchDetails.reminders.days")}
                  </button>
                </div>
                <span className="text-sm text-muted-foreground">{t("matchDetails.reminders.before")}</span>
              </div>
            </div>
          )}

          {/* Exact mode */}
          {mode === "exact" && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label className="text-base font-medium">{t("matchDetails.reminders.date")}</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className={cn(
                        "w-full justify-start text-left text-base",
                        !exactDate && "text-muted-foreground"
                      )}
                    >
                      <CalendarIcon className="mr-2 h-5 w-5" />
                      {exactDate ? format(exactDate, "EEEE, MMMM d, yyyy", { locale: dateLocale }) : t("matchDetails.reminders.pickADate")}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={exactDate}
                      onSelect={setExactDate}
                      disabled={(d) => {
                        const today = new Date()
                        today.setHours(0, 0, 0, 0)
                        return d < today || d > new Date(matchDate)
                      }}
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>
              </div>
              <div className="space-y-2">
                <Label className="text-base font-medium">{t("matchDetails.reminders.time")}</Label>
                <div className="relative">
                  <Clock className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    type="time"
                    value={exactTime}
                    onChange={(e) => setExactTime(e.target.value)}
                    className="pl-11 text-base"
                  />
                </div>
              </div>
            </div>
          )}

          {isScheduledInPast && (
            <p className="text-sm text-destructive">
              {t("matchDetails.reminders.pastError")}
            </p>
          )}

          <Button type="submit" size="lg" className="w-full gap-2" disabled={!canSubmit || loading}>
            {loading ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
              <Bell className="h-5 w-5" />
            )}
            {t("matchDetails.reminders.setReminder")}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  )
}
