import { useState } from "react"
import { format } from "date-fns"
import { Bell, Calendar as CalendarIcon, Clock } from "lucide-react"
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

interface AddReminderDialogProps {
  matchId: string
  matchDate: string
  matchTime: string
  opponent: string
  location: string
  /** Render prop for the trigger button so we can customise appearance per context */
  trigger?: React.ReactNode
}

type ReminderMode = "preset" | "relative" | "exact"

const presets = [
  { label: "30 minutes before", value: "30m" },
  { label: "1 hour before", value: "1h" },
  { label: "2 hours before", value: "2h" },
  { label: "6 hours before", value: "6h" },
  { label: "12 hours before", value: "12h" },
  { label: "24 hours before", value: "24h" },
  { label: "2 days before", value: "2d" },
  { label: "1 week before", value: "1w" },
] as const

export function AddReminderDialog({
  matchDate,
  matchTime,
  opponent,
  location,
  trigger,
}: AddReminderDialogProps) {
  const [open, setOpen] = useState(false)
  const [mode, setMode] = useState<ReminderMode>("preset")
  const [selectedPreset, setSelectedPreset] = useState<string>("24h")

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
      return presets.find((p) => p.value === selectedPreset)?.label ?? selectedPreset
    }
    if (mode === "relative") {
      const amount = parseInt(relativeAmount) || 0
      return `${amount} ${relativeUnit} before`
    }
    if (mode === "exact" && exactDate && exactTime) {
      return `${format(exactDate, "MMM d")} at ${exactTime}`
    }
    return "Custom"
  }

  function handleCreate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const label = getReminderLabel()
    toast.success(`Reminder set: ${label} your match vs ${opponent}`)
    setOpen(false)
    resetForm()
  }

  const canSubmit =
    mode === "preset" ||
    (mode === "relative" && parseInt(relativeAmount) > 0) ||
    (mode === "exact" && exactDate && exactTime)

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
            <span className="hidden sm:inline">Remind me</span>
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold tracking-tight">
            Add Reminder
          </DialogTitle>
        </DialogHeader>

        {/* Match summary */}
        <div className="rounded-2xl border border-border/40 bg-muted/30 p-4">
          <p className="text-base font-semibold text-foreground">
            vs {opponent}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            {format(new Date(matchDate), "EEEE, MMM d")} at {matchTime} &middot; {location}
          </p>
        </div>

        {/* Mode selector */}
        <div className="flex gap-2">
          {([
            { key: "preset", label: "Quick" },
            { key: "relative", label: "Custom" },
            { key: "exact", label: "Exact" },
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
              <Label className="text-base font-medium">When to remind</Label>
              <div className="grid grid-cols-2 gap-2">
                {presets.map((preset) => (
                  <button
                    key={preset.value}
                    type="button"
                    onClick={() => setSelectedPreset(preset.value)}
                    className={cn(
                      "rounded-xl border px-3 py-2.5 text-sm transition-all",
                      selectedPreset === preset.value
                        ? "border-primary bg-primary/10 font-medium text-primary"
                        : "border-border/50 text-foreground hover:border-primary/30"
                    )}
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Relative mode */}
          {mode === "relative" && (
            <div className="space-y-3">
              <Label className="text-base font-medium">Remind me</Label>
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
                    Hours
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
                    Days
                  </button>
                </div>
                <span className="text-sm text-muted-foreground">before</span>
              </div>
            </div>
          )}

          {/* Exact mode */}
          {mode === "exact" && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label className="text-base font-medium">Date</Label>
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
                      {exactDate ? format(exactDate, "EEEE, MMMM d, yyyy") : "Pick a date"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={exactDate}
                      onSelect={setExactDate}
                      disabled={(d) => d > new Date(matchDate)}
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>
              </div>
              <div className="space-y-2">
                <Label className="text-base font-medium">Time</Label>
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

          <Button type="submit" size="lg" className="w-full gap-2" disabled={!canSubmit}>
            <Bell className="h-5 w-5" />
            Set Reminder
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  )
}
