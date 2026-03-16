import { useState, useEffect } from "react"
import { Link } from "react-router-dom"
import {
  Bell,
  Mail,
  CheckCircle,
  TrendingUp,
  Swords,
  Check,
  Loader2,
  ArrowRight,
  XCircle,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { PageHeader } from "@/components/page-header"
import { notificationsService } from "@/lib/services/notifications.service"
import type { Notification as AppNotification } from "@/lib/types"
import { getCurrentUserId } from "@/lib/current-user"
import { formatDistanceToNow } from "date-fns"
import { es as esLocale } from "date-fns/locale"
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

export default function NotificationsPage() {
  const currentUserId = getCurrentUserId()
  const { t, language } = useTranslation()
  const dateLocale = language === "es" ? esLocale : undefined
  const { getTitle, getMessage } = useNotificationText()
  const [notifications, setNotifications] = useState<AppNotification[]>([])
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
      setNotifications((prev) =>
        prev.map((n) => ({ ...n, read: true }))
      )
    } catch {
      // Partial failure: refresh list
      const data = await notificationsService.getAll(currentUserId)
      setNotifications(data)
    }
  }

  if (loading) {
    return (
      <>
        <PageHeader title={t("notifications.title")} description="" />
        <div className="flex flex-1 items-center justify-center p-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </>
    )
  }

  return (
    <>
      <PageHeader
        title={t("notifications.title")}
        description={unreadCount === 1 ? t("notifications.unreadSingular") : t("notifications.unreadPlural", { count: unreadCount })}
      >
        {unreadCount > 0 && (
          <Button variant="ghost" onClick={handleMarkAllRead}>
            <Check className="mr-1.5 h-5 w-5" />
            {t("notifications.markAllRead")}
          </Button>
        )}
      </PageHeader>
      <div className="flex flex-1 flex-col gap-3 p-5 lg:p-8">
        {notifications.length === 0 ? (
          <Card>
            <CardContent className="py-20 text-center">
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-muted">
                <Bell className="h-7 w-7 text-muted-foreground" />
              </div>
              <p className="text-lg font-medium text-foreground">{t("notifications.noNotifications")}</p>
            </CardContent>
          </Card>
        ) : (
          notifications.map((notification) => {
            const Icon = iconMap[notification.type] || Bell
            return (
              <Card
                key={notification.id}
                className={`transition-colors ${
                  !notification.read ? "border-primary/20 bg-primary/[0.02]" : ""
                }`}
              >
                <CardContent className="flex items-start gap-4 p-5">
                  <div
                    className={`mt-0.5 flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl ${
                      notification.read
                        ? "bg-muted"
                        : "bg-primary/10"
                    }`}
                  >
                    <Icon
                      className={`h-5 w-5 ${
                        notification.read
                          ? "text-muted-foreground"
                          : "text-primary"
                      }`}
                    />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p
                          className={`text-base leading-tight ${
                            notification.read
                              ? "text-muted-foreground"
                              : "font-semibold text-foreground"
                          }`}
                        >
                          {getTitle(notification)}
                        </p>
                        <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                          {getMessage(notification)}
                        </p>
                      </div>
                      {!notification.read && (
                        <Button
                          variant="ghost"
                          className="shrink-0 text-sm"
                          onClick={() => handleMarkRead(notification.id)}
                        >
                          {t("notifications.markRead")}
                        </Button>
                      )}
                    </div>
                    <p className="mt-2 text-sm text-muted-foreground">
                      {formatDistanceToNow(new Date(notification.createdAt), {
                        addSuffix: true,
                        locale: dateLocale,
                      })}
                    </p>
                    {notification.metadata?.matchId && (
                      <Link
                        to={`/matches/${notification.metadata.matchId}`}
                        className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
                      >
                        {t("notifications.viewMatch")}
                        <ArrowRight className="h-3.5 w-3.5" />
                      </Link>
                    )}
                    {notification.type === "scheduling_no_match" && notification.metadata?.requestId && (
                      <Link
                        to={`/play/${notification.metadata.requestId}`}
                        className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
                      >
                        {t("notifications.viewInvite")}
                        <ArrowRight className="h-3.5 w-3.5" />
                      </Link>
                    )}
                    {notification.type === "invite_received" && (
                      <Link
                        to="/play"
                        className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
                      >
                        {t("notifications.viewInvites")}
                        <ArrowRight className="h-3.5 w-3.5" />
                      </Link>
                    )}
                  </div>
                </CardContent>
              </Card>
            )
          })
        )}
      </div>
    </>
  )
}
