import { useState, useEffect } from "react"
import { Link } from "react-router-dom"
import { Bell, Mail, CheckCircle, TrendingUp, Swords, Loader2, XCircle, Check } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { notificationsService } from "@/lib/services/notifications.service"
import type { Notification } from "@/lib/types"
import { getCurrentUserId } from "@/lib/current-user"
import { useTranslation } from "@/lib/i18n"
import { useNotificationText } from "@/lib/hooks/use-notification-text"

const iconMap: Record<string, typeof Bell> = {
  invite_received: Mail,
  result_pending: CheckCircle,
  match_completed: Swords,
  rating_change: TrendingUp,
  invite_accepted: CheckCircle,
  match_cancelled: XCircle,
  scheduling_no_match: XCircle,
}

export function NotificationsDropdown() {
  const currentUserId = getCurrentUserId()
  const { t } = useTranslation()
  const { getTitle, getMessage } = useNotificationText()
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [loading, setLoading] = useState(true)
  const unreadCount = notifications.filter((n) => !n.read).length

  useEffect(() => {
    let cancelled = false
    notificationsService
      .getAll(currentUserId)
      .then((data) => {
        if (!cancelled) setNotifications(data)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => { cancelled = true }
  }, [currentUserId])

  async function handleMarkRead(id: string) {
    try {
      const updated = await notificationsService.markAsRead(id)
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? updated : n))
      )
    } catch {
      // Optimistic revert handled by not updating on error
    }
  }

  async function handleMarkAllRead() {
    const unread = notifications.filter((n) => !n.read)
    if (unread.length === 0) return
    try {
      await notificationsService.markAllAsRead(notifications)
      setNotifications((prev) => prev.map((n) => ({ ...n, read: true })))
    } catch {
      // Partial failure: refresh list from backend
      const data = await notificationsService.getAll(currentUserId)
      setNotifications(data)
    }
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
          <span className="sr-only">{t("notifications.title")}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-96">
        <DropdownMenuLabel className="flex flex-wrap items-center justify-between gap-x-2 gap-y-2 py-3">
          <span className="text-base font-semibold shrink-0">{t("notifications.title")}</span>
          <div className="flex items-center gap-2">
            {unreadCount > 0 && (
              <span className="rounded-lg bg-primary/10 px-2.5 py-1 text-sm font-medium text-primary">
                {unreadCount === 1
                  ? t("notifications.unreadSingular")
                  : t("notifications.unreadPlural", { count: unreadCount })}
              </span>
            )}
            {unreadCount > 0 && (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-xs"
                onClick={handleMarkAllRead}
              >
                <Check className="mr-1 h-3 w-3" />
                {t("notifications.markAllRead")}
              </Button>
            )}
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {loading ? (
          <div className="flex items-center justify-center gap-2 py-6 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            {t("common.loading")}
          </div>
        ) : notifications.length === 0 ? (
          <div className="py-6 text-center text-sm text-muted-foreground">
            {t("notifications.noNotifications")}
          </div>
        ) : (
          notifications.slice(0, 5).map((notification) => {
            const Icon = iconMap[notification.type] || Bell
            const matchLink = notification.metadata?.matchId
              ? `/matches/${notification.metadata.matchId}`
              : notification.metadata?.requestId
                ? `/play/${notification.metadata.requestId}`
                : notification.type === "invite_received"
                  ? "/play"
                  : null
            const content = (
              <>
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
                <div className="flex-1 space-y-0.5 min-w-0">
                  <p
                    className={`text-base leading-tight ${
                      notification.read
                        ? "text-muted-foreground"
                        : "font-medium text-foreground"
                    }`}
                  >
                    {getTitle(notification)}
                  </p>
                  <p className="text-sm leading-snug text-muted-foreground line-clamp-2">
                    {getMessage(notification)}
                  </p>
                </div>
                {!notification.read && (
                  <div className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full bg-primary" />
                )}
              </>
            )
            return (
              <DropdownMenuItem
                key={notification.id}
                className="flex cursor-pointer gap-3 p-4"
                asChild={!!matchLink}
                onClick={!matchLink ? () => handleMarkRead(notification.id) : undefined}
              >
                {matchLink ? (
                  <Link to={matchLink} className="flex flex-1 items-start gap-3" onClick={() => handleMarkRead(notification.id)}>
                    {content}
                  </Link>
                ) : (
                  content
                )}
              </DropdownMenuItem>
            )
          })
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild className="justify-center py-3">
          <Link to="/notifications" className="text-base font-medium text-primary">
            {t("notifications.viewAll")}
          </Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
