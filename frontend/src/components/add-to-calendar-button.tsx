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
  opponent: string
  matchType: "competitive" | "practice"
  /** Render as compact icon-only button */
  compact?: boolean
}

function formatGoogleCalendarUrl({
  date,
  time,
  location,
  opponent,
  matchType,
}: AddToCalendarButtonProps): string {
  // Parse date and time to create ISO datetime
  const [year, month, day] = date.split("-")
  const [hours, minutes] = time.split(":")
  const startDate = `${year}${month}${day}T${hours}${minutes}00`
  // Assume 1.5 hours for a match
  const endHour = (parseInt(hours) + 1).toString().padStart(2, "0")
  const endMin = (parseInt(minutes) + 30).toString().padStart(2, "0")
  const endDate = `${year}${month}${day}T${endHour}${endMin}00`

  const title = encodeURIComponent(
    `Tennis ${matchType === "competitive" ? "Match" : "Practice"} vs ${opponent}`
  )
  const details = encodeURIComponent(
    `${matchType === "competitive" ? "Competitive match" : "Practice session"} against ${opponent} at ${location}`
  )
  const loc = encodeURIComponent(location)

  return `https://calendar.google.com/calendar/event?action=TEMPLATE&text=${title}&dates=${startDate}/${endDate}&details=${details}&location=${loc}`
}

function formatIcsContent({
  date,
  time,
  location,
  opponent,
  matchType,
}: AddToCalendarButtonProps): string {
  const [year, month, day] = date.split("-")
  const [hours, minutes] = time.split(":")
  const startDate = `${year}${month}${day}T${hours}${minutes}00`
  const endHour = (parseInt(hours) + 1).toString().padStart(2, "0")
  const endMin = (parseInt(minutes) + 30).toString().padStart(2, "0")
  const endDate = `${year}${month}${day}T${endHour}${endMin}00`

  const title = `Tennis ${matchType === "competitive" ? "Match" : "Practice"} vs ${opponent}`
  const description = `${matchType === "competitive" ? "Competitive match" : "Practice session"} against ${opponent} at ${location}`

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
  link.download = `match-vs-${props.opponent.replace(/\s/g, "-").toLowerCase()}.ics`
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
