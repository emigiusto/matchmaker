import { CalendarPlus } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

interface AddToCalendarButtonProps {
  date: string // "2026-02-19"
  time: string // "18:00"
  location: string
  /** Participant names (2 for singles, 4 for doubles). Used in description. */
  participants: string[]
  matchType: "competitive" | "practice"
  /** Render as compact icon-only button */
  compact?: boolean
}

function buildCalendarParts(props: AddToCalendarButtonProps) {
  const { participants, location } = props
  const participantNames = participants.filter(Boolean)
  const title = "Match"
  const description =
    participantNames.length > 0
      ? `Participants: ${participantNames.join(", ")}\n\nLocation: ${location}`
      : `Location: ${location}`
  return { title, description }
}

function formatGoogleCalendarUrl(props: AddToCalendarButtonProps): string {
  const { date, time, location } = props
  const [year, month, day] = date.split("-")
  const [hours, minutes] = time.split(":")
  const startDate = `${year}${month}${day}T${hours}${minutes}00`
  const endHour = (parseInt(hours) + 1).toString().padStart(2, "0")
  const endMin = (parseInt(minutes) + 30).toString().padStart(2, "0")
  const endDate = `${year}${month}${day}T${endHour}${endMin}00`

  const { title, description } = buildCalendarParts(props)
  return `https://calendar.google.com/calendar/event?action=TEMPLATE&text=${encodeURIComponent(title)}&dates=${startDate}/${endDate}&details=${encodeURIComponent(description)}&location=${encodeURIComponent(location)}`
}

function formatIcsContent(props: AddToCalendarButtonProps): string {
  const { date, time, location } = props
  const [year, month, day] = date.split("-")
  const [hours, minutes] = time.split(":")
  const startDate = `${year}${month}${day}T${hours}${minutes}00`
  const endHour = (parseInt(hours) + 1).toString().padStart(2, "0")
  const endMin = (parseInt(minutes) + 30).toString().padStart(2, "0")
  const endDate = `${year}${month}${day}T${endHour}${endMin}00`

  const { title, description } = buildCalendarParts(props)

  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "BEGIN:VEVENT",
    `DTSTART:${startDate}`,
    `DTEND:${endDate}`,
    `SUMMARY:${title}`,
    `DESCRIPTION:${description}`,
    `LOCATION:${location}`,
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\n")
}

function downloadIcs(props: AddToCalendarButtonProps) {
  const content = formatIcsContent(props)
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
  const googleUrl = formatGoogleCalendarUrl(props)

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
            <span className="hidden sm:inline">Calendar</span>
          </Button>
        ) : (
          <Button variant="outline" size="sm" className="gap-1.5">
            <CalendarPlus className="h-4 w-4" />
            Add to Calendar
          </Button>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem asChild>
          <a href={googleUrl} target="_blank" rel="noopener noreferrer">
            Google Calendar
          </a>
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => downloadIcs(props)}>
          Apple / Outlook (.ics)
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
