import { CalendarPlus } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { useTranslation } from "@/lib/i18n/use-translation"

interface AddToCalendarButtonProps {
  date: string // "2026-02-19"
  time: string // "18:00"
  location: string
  /** Participant names (2 for singles, 4 for doubles). Used in description. */
  participants: string[]
  matchType: "competitive" | "practice"
  /** Optional: opponent name for clearer title (e.g. "Match vs Juan - Court 3"). */
  opponentName?: string
  /** Render as compact icon-only button */
  compact?: boolean
}

type TFn = (key: string, params?: Record<string, string | number>) => string

function buildCalendarParts(props: AddToCalendarButtonProps, t: TFn) {
  const { participants, location, matchType, opponentName } = props
  const participantNames = participants.filter(Boolean)
  const isDoubles = participantNames.length >= 4

  let title: string
  if (isDoubles) {
    const teamA = participantNames.slice(0, 2).join(" & ")
    const teamB = participantNames.slice(2, 4).join(" & ")
    const key = location
      ? "matchDetails.addToCalendar.eventTitleDoubles"
      : "matchDetails.addToCalendar.eventTitleDoublesNoLocation"
    title = t(key, { teamA, teamB, location })
  } else {
    const opponent =
      opponentName ||
      (participantNames.length >= 2
        ? participantNames[1]
        : participantNames[0] ?? t("matchDetails.addToCalendar.eventOpponentFallback"))
    const isPractice = matchType === "practice"
    const key = isPractice
      ? location
        ? "matchDetails.addToCalendar.eventTitlePractice"
        : "matchDetails.addToCalendar.eventTitlePracticeNoLocation"
      : location
        ? "matchDetails.addToCalendar.eventTitleMatch"
        : "matchDetails.addToCalendar.eventTitleMatchNoLocation"
    title = t(key, { opponent, location })
  }

  const typeLabel = matchType === "practice"
    ? t("matchDetails.addToCalendar.eventDescTypePractice")
    : t("matchDetails.addToCalendar.eventDescTypeCompetitive")

  const descriptionLines = [
    t("matchDetails.addToCalendar.eventDescType", { type: typeLabel }),
    participantNames.length > 0
      ? t("matchDetails.addToCalendar.eventDescPlayers", { names: participantNames.join(", ") })
      : null,
    t("matchDetails.addToCalendar.eventDescLocation", { location }),
  ].filter(Boolean) as string[]

  return { title, description: descriptionLines.join("\n") }
}

const EUROPE_MADRID_TZ = "Europe/Madrid"

function buildDateTimeRange(props: AddToCalendarButtonProps) {
  const { date, time } = props
  const [year, month, day] = date.split("-").map((v) => parseInt(v, 10))
  const [hours, minutes] = time.split(":").map((v) => parseInt(v, 10))

  // Treat date/time as local wall-clock time in Europe/Madrid.
  const start = new Date(year, month - 1, day, hours, minutes, 0, 0)
  const end = new Date(start.getTime() + 60 * 60 * 1000) // always 1 hour

  const fmt = (d: Date) => {
    const y = d.getFullYear().toString().padStart(4, "0")
    const m = (d.getMonth() + 1).toString().padStart(2, "0")
    const dd = d.getDate().toString().padStart(2, "0")
    const hh = d.getHours().toString().padStart(2, "0")
    const mm = d.getMinutes().toString().padStart(2, "0")
    return `${y}${m}${dd}T${hh}${mm}00`
  }

  return {
    start: fmt(start),
    end: fmt(end),
  }
}

function formatGoogleCalendarUrl(props: AddToCalendarButtonProps, t: TFn): string {
  const { location } = props
  const { start, end } = buildDateTimeRange(props)

  const { title, description } = buildCalendarParts(props, t)
  const base = "https://calendar.google.com/calendar/event?action=TEMPLATE"
  const params = new URLSearchParams({
    text: title,
    dates: `${start}/${end}`,
    details: description,
    location,
    ctz: EUROPE_MADRID_TZ,
  })

  return `${base}&${params.toString()}`
}

function formatIcsContent(props: AddToCalendarButtonProps, t: TFn): string {
  const { location } = props
  const { start, end } = buildDateTimeRange(props)

  const { title, description } = buildCalendarParts(props, t)

  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "BEGIN:VEVENT",
    `DTSTART;TZID=${EUROPE_MADRID_TZ}:${start}`,
    `DTEND;TZID=${EUROPE_MADRID_TZ}:${end}`,
    `SUMMARY:${title}`,
    `DESCRIPTION:${description}`,
    `LOCATION:${location}`,
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\n")
}

function downloadIcs(props: AddToCalendarButtonProps, t: TFn) {
  const content = formatIcsContent(props, t)
  const blob = new Blob([content], { type: "text/calendar" })
  const url = URL.createObjectURL(blob)
  const link = document.createElement("a")
  link.href = url
  const slug = props.participants.filter(Boolean).join("-").replace(/\s/g, "-").toLowerCase() || "match"
  link.download = `${slug.slice(0, 50)}.ics`
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

export function AddToCalendarButton(props: AddToCalendarButtonProps) {
  const { compact = false } = props
  const { t } = useTranslation()
  const googleUrl = formatGoogleCalendarUrl(props, t)

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        {compact ? (
          <Button
            variant="ghost"
            size="sm"
            className="gap-1.5 text-muted-foreground hover:text-primary"
          >
            <CalendarPlus className="h-4 w-4" />
            <span className="hidden sm:inline">{t("matchDetails.addToCalendar.calendar")}</span>
          </Button>
        ) : (
          <Button variant="outline" size="sm" className="gap-1.5">
            <CalendarPlus className="h-4 w-4" />
            {t("matchDetails.addToCalendar.addToCalendar")}
          </Button>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem asChild>
          <a href={googleUrl} target="_blank" rel="noopener noreferrer">
            {t("matchDetails.addToCalendar.googleCalendar")}
          </a>
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => downloadIcs(props, t)}>
          {t("matchDetails.addToCalendar.appleOutlook")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
