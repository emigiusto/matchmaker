import { useState, useEffect, useCallback } from "react"
import { format, startOfDay, isBefore } from "date-fns"
import { es as esLocale, enUS } from "date-fns/locale"
import { CalendarIcon, Clock, Loader2, Building2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { toast } from "sonner"
import { cn } from "@/lib/utils"
import { matchesService } from "@/lib/services/matches.service"
import { bookingService, type ClubMembershipDTO, type CourtAvailabilityResult } from "@/lib/services/booking.service"
import { useTranslation } from "@/lib/i18n"
import type { Match } from "@/lib/types"

const TIME_SLOTS: string[] = []
for (let h = 6; h <= 22; h++) {
  TIME_SLOTS.push(`${String(h).padStart(2, "0")}:00`)
}

interface RescheduleMatchDialogProps {
  matchId: string
  userId: string
  match: Match
  onSuccess: (match: Match) => void
}

export function RescheduleMatchDialog({ matchId, userId, match, onSuccess }: RescheduleMatchDialogProps) {
  const { t, language } = useTranslation()
  const dateLocale = language === "es" ? esLocale : enUS

  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [date, setDate] = useState<Date | undefined>(undefined)
  const [time, setTime] = useState<string>(match.time?.slice(0, 5) ?? "")
  const [calendarOpen, setCalendarOpen] = useState(false)

  const [memberships, setMemberships] = useState<ClubMembershipDTO[]>([])
  const [courtAvailability, setCourtAvailability] = useState<CourtAvailabilityResult | null>(null)
  const [courtAvailabilityLoading, setCourtAvailabilityLoading] = useState(false)

  // Pending reschedule params — set when we need to show the booking prompt
  const [pendingReschedule, setPendingReschedule] = useState<{ scheduledAt: string; updatedMatch: Match } | null>(null)

  const activeMembership = memberships.find((m) => m.status === "active" && m.hasPassword) ?? null

  // Load memberships once when dialog opens
  useEffect(() => {
    if (!open) return
    bookingService.listMemberships(userId).then(setMemberships).catch(() => {})
  }, [open, userId])

  const fetchAvailability = useCallback(async (selectedDate: Date, membership: ClubMembershipDTO) => {
    setCourtAvailabilityLoading(true)
    setCourtAvailability(null)
    try {
      const result = await bookingService.checkAvailability({
        userId,
        clubSlug: membership.clubSlug,
        date: format(selectedDate, "yyyy-MM-dd"),
        sport: match.sport ?? "tennis",
      })
      setCourtAvailability(result)
    } catch {
      setCourtAvailability(null)
    } finally {
      setCourtAvailabilityLoading(false)
    }
  }, [userId, match.sport])

  function handleDateSelect(selected: Date | undefined) {
    setDate(selected)
    setCourtAvailability(null)
    if (selected && activeMembership) {
      fetchAvailability(selected, activeMembership)
    }
  }

  async function handleConfirm() {
    if (!date || !time) return
    const dateStr = format(date, "yyyy-MM-dd")
    const scheduledAt = new Date(`${dateStr}T${time}:00`).toISOString()
    setLoading(true)
    try {
      if (match.bookingEnabled) {
        // Reschedule without touching the booking yet — prompt the user next
        const updated = await matchesService.reschedule(matchId, userId, scheduledAt, false)
        setOpen(false)
        setPendingReschedule({ scheduledAt, updatedMatch: updated })
      } else {
        const updated = await matchesService.reschedule(matchId, userId, scheduledAt)
        toast.success(t("matchDetails.rescheduleMatch.successToast"))
        setOpen(false)
        onSuccess(updated)
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("matchDetails.rescheduleMatch.failedToReschedule"))
    } finally {
      setLoading(false)
    }
  }

  async function handleBookingPromptResponse(cancelBooking: boolean) {
    if (!pendingReschedule) return
    const { updatedMatch } = pendingReschedule
    setPendingReschedule(null)

    if (cancelBooking) {
      try {
        await bookingService.cancelBooking(matchId)
      } catch {
        // Non-fatal — booking may already be cancelled or not exist
      }
    }

    toast.success(t("matchDetails.rescheduleMatch.successToast"))
    onSuccess(updatedMatch)
  }

  function handleOpenChange(next: boolean) {
    setOpen(next)
    if (!next) {
      // Reset state when closing
      setDate(undefined)
      setTime(match.time?.slice(0, 5) ?? "")
      setCourtAvailability(null)
    }
  }

  const canConfirm = !!date && !!time && !loading

  return (
    <>
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogTrigger asChild>
          <Button variant="outline" size="sm" className="gap-2">
            <Clock className="h-4 w-4" />
            {t("matchDetails.rescheduleMatch.button")}
          </Button>
        </DialogTrigger>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{t("matchDetails.rescheduleMatch.title")}</DialogTitle>
            <DialogDescription>{t("matchDetails.rescheduleMatch.description")}</DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* Date picker */}
            <div className="space-y-1.5">
              <label className="text-sm font-medium">{t("matchDetails.rescheduleMatch.newDate")}</label>
              <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn("w-full justify-start gap-2 text-left font-normal", !date && "text-muted-foreground")}
                  >
                    <CalendarIcon className="h-4 w-4" />
                    {date ? format(date, "PPP", { locale: dateLocale }) : t("matchDetails.rescheduleMatch.pickDate")}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={date}
                    onSelect={(d) => { handleDateSelect(d); setCalendarOpen(false) }}
                    disabled={(d) => isBefore(startOfDay(d), startOfDay(new Date()))}
                    locale={dateLocale}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
            </div>

            {/* Time picker */}
            <div className="space-y-1.5">
              <label className="text-sm font-medium">{t("matchDetails.rescheduleMatch.newTime")}</label>
              <Select value={time} onValueChange={setTime}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="HH:MM" />
                </SelectTrigger>
                <SelectContent>
                  {TIME_SLOTS.map((slot) => {
                    const count = courtAvailability
                      ? courtAvailability.availableCourts.filter((c) => c.time === slot).length
                      : null
                    return (
                      <SelectItem key={slot} value={slot}>
                        <span className="flex items-center justify-between gap-6 w-full">
                          <span>{slot}</span>
                          {count !== null && (
                            <span className={cn("text-xs", count > 0 ? "text-green-600" : "text-muted-foreground")}>
                              {t("wizard.availableCourtsCount", { count })}
                            </span>
                          )}
                        </span>
                      </SelectItem>
                    )
                  })}
                </SelectContent>
              </Select>
            </div>

            {/* Court availability panel */}
            {activeMembership && (
              <div className="rounded-lg border border-border/40 bg-muted/20 px-3 py-2.5 space-y-2">
                <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                  <Building2 className="h-3.5 w-3.5" />
                  {t("matchDetails.rescheduleMatch.courtAvailability")}
                </p>
                {!date && (
                  <p className="text-xs text-muted-foreground">{t("matchDetails.rescheduleMatch.courtAvailabilityHint")}</p>
                )}
                {date && courtAvailabilityLoading && (
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    {t("matchDetails.rescheduleMatch.checkingCourts")}
                  </div>
                )}
                {date && !courtAvailabilityLoading && courtAvailability && (() => {
                  const slots = TIME_SLOTS
                  return (
                    <div className="grid grid-cols-2 gap-x-4 gap-y-0.5">
                      {slots.map((slot) => {
                        const count = courtAvailability.availableCourts.filter((c) => c.time === slot).length
                        if (count === 0) return null
                        return (
                          <button
                            key={slot}
                            type="button"
                            onClick={() => setTime(slot)}
                            className={cn(
                              "flex items-center justify-between rounded px-1.5 py-0.5 text-xs transition-colors text-left",
                              time === slot
                                ? "bg-primary/10 font-semibold text-primary"
                                : "text-green-700 dark:text-green-400 hover:bg-muted"
                            )}
                          >
                            <span>{slot}</span>
                            <span className="text-muted-foreground">{t("wizard.availableCourtsCount", { count })}</span>
                          </button>
                        )
                      })}
                    </div>
                  )
                })()}
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => handleOpenChange(false)} disabled={loading}>
              {t("form.cancel")}
            </Button>
            <Button onClick={handleConfirm} disabled={!canConfirm}>
              {loading
                ? <><Loader2 className="h-4 w-4 animate-spin mr-2" />{t("matchDetails.rescheduleMatch.confirming")}</>
                : t("matchDetails.rescheduleMatch.confirm")
              }
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!pendingReschedule} onOpenChange={(open) => { if (!open) handleBookingPromptResponse(false) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("matchDetails.rescheduleMatch.cancelBookingPrompt.title")}</AlertDialogTitle>
            <AlertDialogDescription>{t("matchDetails.rescheduleMatch.cancelBookingPrompt.description")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => handleBookingPromptResponse(false)}>
              {t("matchDetails.rescheduleMatch.cancelBookingPrompt.no")}
            </AlertDialogCancel>
            <AlertDialogAction onClick={() => handleBookingPromptResponse(true)}>
              {t("matchDetails.rescheduleMatch.cancelBookingPrompt.yes")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
