import { useState } from "react"
import { Link } from "react-router-dom"
import { format } from "date-fns"
import { Bell, Clock, Trash2, MapPin, ArrowRight } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Switch } from "@/components/ui/switch"
import { PageHeader } from "@/components/page-header"
import { toast } from "sonner"
import type { Reminder } from "@/lib/types"

const defaultReminders: Reminder[] = [
  {
    id: "rem-001",
    matchId: "match-001",
    matchDate: "2026-02-19",
    matchTime: "18:00",
    opponent: "Maria Santos",
    location: "Club Tennis Barcelona",
    reminderTime: "2026-02-18T18:00:00Z",
    type: "preset",
    label: "24 hours before",
    enabled: true,
  },
  {
    id: "rem-002",
    matchId: "match-001",
    matchDate: "2026-02-19",
    matchTime: "18:00",
    opponent: "Maria Santos",
    location: "Club Tennis Barcelona",
    reminderTime: "2026-02-19T16:00:00Z",
    type: "preset",
    label: "2 hours before",
    enabled: true,
  },
  {
    id: "rem-003",
    matchId: "match-002",
    matchDate: "2026-02-21",
    matchTime: "10:00",
    opponent: "Daniel Kim",
    location: "Pista Municipal Sarria",
    reminderTime: "2026-02-20T10:00:00Z",
    type: "preset",
    label: "24 hours before",
    enabled: true,
  },
]

export default function RemindersPage() {
  const [reminders, setReminders] = useState<Reminder[]>(defaultReminders)

  function handleToggle(id: string) {
    setReminders((prev) =>
      prev.map((r) => (r.id === id ? { ...r, enabled: !r.enabled } : r))
    )
  }

  function handleDelete(id: string) {
    setReminders((prev) => prev.filter((r) => r.id !== id))
    toast.success("Reminder deleted")
  }

  return (
    <>
      <PageHeader
        title="Reminders"
        description="Manage your match reminders. Add new reminders from any upcoming match."
      />
      <div className="flex flex-1 flex-col gap-3 p-5 lg:p-8">
        {reminders.length === 0 ? (
          <Card>
            <CardContent className="py-20 text-center">
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-muted">
                <Bell className="h-7 w-7 text-muted-foreground" />
              </div>
              <p className="text-lg font-medium text-foreground">No reminders set</p>
              <p className="mt-1 text-base text-muted-foreground">
                Open any upcoming match and tap "Add Reminder"
              </p>
              <Button variant="outline" size="lg" className="mt-6 gap-2" asChild>
                <Link to="/matches/upcoming">
                  View Upcoming Matches
                  <ArrowRight className="h-5 w-5" />
                </Link>
              </Button>
            </CardContent>
          </Card>
        ) : (
          reminders.map((reminder) => (
            <Card
              key={reminder.id}
              className={`transition-colors ${!reminder.enabled ? "opacity-50" : ""}`}
            >
              <CardContent className="flex items-center gap-4 p-5">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-primary/10">
                  <Clock className="h-5 w-5 text-primary" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex min-w-0 items-center gap-2">
                    <p className="truncate text-sm font-semibold text-foreground">
                      vs {reminder.opponent}
                    </p>
                    <span className="shrink-0 rounded-lg bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                      {reminder.label}
                    </span>
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Bell className="h-3.5 w-3.5 shrink-0" />
                      {format(new Date(reminder.matchDate), "MMM d")} at{" "}
                      {reminder.matchTime}
                    </span>
                    <span className="flex min-w-0 items-center gap-1">
                      <MapPin className="h-3.5 w-3.5 shrink-0" />
                      <span className="truncate">{reminder.location}</span>
                    </span>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-sm text-primary"
                    asChild
                  >
                    <Link to={`/matches/${reminder.matchId}`}>
                      View match
                    </Link>
                  </Button>
                  <Switch
                    checked={reminder.enabled}
                    onCheckedChange={() => handleToggle(reminder.id)}
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    className="text-muted-foreground hover:text-destructive"
                    onClick={() => handleDelete(reminder.id)}
                  >
                    <Trash2 className="h-5 w-5" />
                    <span className="sr-only">Delete</span>
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </>
  )
}
