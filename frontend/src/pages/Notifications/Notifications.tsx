import { useState } from "react"
import {
  Bell,
  Mail,
  CheckCircle,
  TrendingUp,
  Swords,
  Check,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { PageHeader } from "@/components/page-header"
// TODO: wire to API — replace with notificationsService.list()
import { mockNotifications } from "@/lib/mock-data"
import type { Notification } from "@/lib/types"
import { formatDistanceToNow } from "date-fns"

const iconMap: Record<string, typeof Bell> = {
  invite_received: Mail,
  result_pending: CheckCircle,
  match_completed: Swords,
  rating_change: TrendingUp,
  invite_accepted: CheckCircle,
}

export default function NotificationsPage() {
  const [notifications, setNotifications] = useState<Notification[]>(mockNotifications)
  const unreadCount = notifications.filter((n) => !n.read).length

  function handleMarkRead(id: string) {
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, read: true } : n))
    )
  }

  function handleMarkAllRead() {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })))
  }

  return (
    <>
      <PageHeader title="Notifications" description={`${unreadCount} unread`}>
        {unreadCount > 0 && (
          <Button variant="ghost" onClick={handleMarkAllRead}>
            <Check className="mr-1.5 h-5 w-5" />
            Mark all read
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
              <p className="text-lg font-medium text-foreground">No notifications</p>
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
                          {notification.title}
                        </p>
                        <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                          {notification.message}
                        </p>
                      </div>
                      {!notification.read && (
                        <Button
                          variant="ghost"
                          className="shrink-0 text-sm"
                          onClick={() => handleMarkRead(notification.id)}
                        >
                          Mark read
                        </Button>
                      )}
                    </div>
                    <p className="mt-2 text-sm text-muted-foreground">
                      {formatDistanceToNow(new Date(notification.createdAt), {
                        addSuffix: true,
                      })}
                    </p>
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
