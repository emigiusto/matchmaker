import { useState } from "react"
import { Link } from "react-router-dom"
import { Bell, Mail, CheckCircle, TrendingUp, Swords } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
// TODO: wire to API — replace mockNotifications with notificationsService.list()
import { mockNotifications } from "@/lib/mock-data"

const iconMap: Record<string, typeof Bell> = {
  invite_received: Mail,
  result_pending: CheckCircle,
  match_completed: Swords,
  rating_change: TrendingUp,
  invite_accepted: CheckCircle,
}

export function NotificationsDropdown() {
  const [notifications, setNotifications] = useState(mockNotifications)
  const unreadCount = notifications.filter((n) => !n.read).length

  function handleMarkRead(id: string) {
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, read: true } : n))
    )
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="relative rounded-xl">
          <Bell className="h-5 w-5" />
          {unreadCount > 0 && (
            <span className="absolute -right-0.5 -top-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-primary text-[11px] font-bold text-primary-foreground">
              {unreadCount}
            </span>
          )}
          <span className="sr-only">Notifications</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-96">
        <DropdownMenuLabel className="flex items-center justify-between py-3">
          <span className="text-base font-semibold">Notifications</span>
          {unreadCount > 0 && (
            <span className="rounded-lg bg-primary/10 px-2.5 py-1 text-sm font-medium text-primary">
              {unreadCount} new
            </span>
          )}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {notifications.slice(0, 5).map((notification) => {
          const Icon = iconMap[notification.type] || Bell
          return (
            <DropdownMenuItem
              key={notification.id}
              className="flex cursor-pointer gap-3 p-4"
              onClick={() => handleMarkRead(notification.id)}
            >
              <div
                className={`mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
                  notification.read ? "bg-muted" : "bg-primary/10"
                }`}
              >
                <Icon
                  className={`h-4 w-4 ${
                    notification.read ? "text-muted-foreground" : "text-primary"
                  }`}
                />
              </div>
              <div className="flex-1 space-y-0.5">
                <p
                  className={`text-base leading-tight ${
                    notification.read
                      ? "text-muted-foreground"
                      : "font-medium text-foreground"
                  }`}
                >
                  {notification.title}
                </p>
                <p className="text-sm leading-snug text-muted-foreground">
                  {notification.message}
                </p>
              </div>
              {!notification.read && (
                <div className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full bg-primary" />
              )}
            </DropdownMenuItem>
          )
        })}
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild className="justify-center py-3">
          <Link to="/notifications" className="text-base font-medium text-primary">
            View all notifications
          </Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
