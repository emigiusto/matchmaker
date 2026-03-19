import { format } from "date-fns"
import { es as esLocale } from "date-fns/locale"
import { useTranslation } from "@/lib/i18n"
import type { Notification } from "@/lib/types"

export function useNotificationText() {
  const { t, language } = useTranslation()
  const dateLocale = language === "es" ? esLocale : undefined

  function fmtDate(iso: string | undefined): string | null {
    if (!iso) return null
    try { return format(new Date(iso), "EEE, MMM d", { locale: dateLocale }) } catch { return null }
  }

  function getTitle(n: Notification): string {
    const raw = n.metadata?._type ?? ""
    const opponents = n.metadata?.opponentNames ?? null
    switch (raw) {
      case "invite.accepted":      return t("notifications.titles.inviteAccepted")
      case "match.created":        return t("notifications.titles.matchConfirmed")
      case "match.completed":      return t("notifications.titles.matchCompleted")
      case "match.cancelled":      return opponents
        ? t("notifications.titles.matchCancelledVs", { opponents })
        : t("notifications.titles.matchCancelled")
      case "scheduling.no_match":  return t("notifications.titles.noPlayersFound")
      case "invite_received":      return t("notifications.titles.newInvite")
      case "result_pending":       return t("notifications.titles.resultPending")
      case "rating_change":        return t("notifications.titles.ratingUpdated")
      case "booking.success":       return t("notifications.titles.courtBooked")
      case "booking.cancelled":     return t("notifications.titles.bookingCancelled")
      case "booking.cancel_failed": return t("notifications.titles.bookingCancelFailed")
      default:                     return n.title
    }
  }

  function getMessage(n: Notification): string {
    const raw = n.metadata?._type ?? ""
    const m = n.metadata ?? {}
    const opponents = m.opponentNames ?? null
    const dateStr = fmtDate(m.scheduledAt ?? m.date ?? undefined)
    const timeStr = m.time ?? null
    const location = m.location?.trim() ?? null
    const atTime = timeStr ? ` ${t("notifications.atTime", { time: timeStr })}` : ""

    switch (raw) {
      case "invite.accepted":
        return dateStr
          ? t("notifications.messages.scheduledForDate", { date: dateStr })
          : t("notifications.messages.scheduled")
      case "match.created": {
        const parts: string[] = []
        if (opponents) parts.push(t("notifications.messages.matchCreated", { opponents, date: "" }).trim())
        if (dateStr) parts.push(dateStr)
        if (atTime) parts[parts.length - 1] = (parts[parts.length - 1] ?? "") + atTime
        if (location) parts.push(`· ${location}`)
        return parts.join(" ") || t("notifications.messages.scheduled")
      }
      case "match.completed":
        return t("notifications.messages.matchCompleted")
      case "match.cancelled": {
        const parts: string[] = []
        if (opponents) parts.push(`vs ${opponents}`)
        if (dateStr) parts.push(dateStr)
        if (atTime) parts[parts.length - 1] = (parts[parts.length - 1] ?? "") + atTime
        if (location) parts.push(`· ${location}`)
        return parts.length > 0
          ? t("notifications.messages.matchCancelledParts", { parts: parts.join(" ") })
          : t("notifications.messages.matchCancelled")
      }
      case "scheduling.no_match": {
        const sportType = m.sportType ?? null
        const fmt = m.format ?? null
        const sport = sportType
          ? `${sportType.charAt(0).toUpperCase()}${sportType.slice(1)}${fmt ? ` ${fmt}` : ""}`
          : null
        const reason = m.reason ?? null
        const reasonText = reason === "scheduled_time_passed"
          ? t("notifications.messages.noMatchTimePassed")
          : t("notifications.messages.noMatchNoneAccepted")
        const header = sport
          ? t("notifications.messages.noMatchFoundSport", { sport })
          : t("notifications.messages.noMatchFound")
        return `${header} ${reasonText}`
      }
      case "invite_received":  return t("notifications.messages.inviteReceived")
      case "result_pending":   return t("notifications.messages.resultPending")
      case "rating_change":    return t("notifications.messages.ratingUpdated")
      case "booking.success": {
        const courtName = m.courtName ?? null
        return courtName
          ? t("notifications.messages.courtBooked", { court: courtName })
          : t("notifications.messages.courtBookedGeneric")
      }
      case "booking.cancelled":     return t("notifications.messages.bookingCancelled")
      case "booking.cancel_failed": return t("notifications.messages.bookingCancelFailed")
      default:                 return n.message
    }
  }

  return { getTitle, getMessage, dateLocale }
}
