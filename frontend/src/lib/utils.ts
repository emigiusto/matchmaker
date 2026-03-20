import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'
import type { Match } from '@/lib/types'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function isMatchInPast(date: string, time: string): boolean {
  return new Date(`${date}T${time}`) < new Date()
}

/**
 * Maps a structured booking error code to a localized string.
 * Falls back to a generic message for unknown or missing codes.
 */
export function getBookingErrorMessage(
  errorCode: string | null,
  t: (key: string, params?: Record<string, string | number>) => string,
): string {
  switch (errorCode) {
    case 'MISSING_SOCIO_NUMBER':
      return t("matchDetails.booking.errors.missingSocioNumber")
    case 'NO_AVAILABLE_COURTS':
      return t("matchDetails.booking.errors.noAvailableCourts")
    case 'ADAPTER_OFFLINE':
      return t("matchDetails.booking.errors.systemOffline")
    case 'SLOT_NOT_FOUND':
      return t("matchDetails.booking.errors.slotNoLongerAvailable")
    default:
      return t("matchDetails.booking.errors.unknown")
  }
}

/** Returns participant display string: all names for doubles, "vs Name" for singles */
export function matchParticipantsLabel(match: Match, currentUserId: string, vsLabel: string): string {
  const participants = match.participants ?? []
  const firstName = (n: string) => n.trim().split(/\s+/)[0] ?? n.trim()
  if (participants.length >= 4) {
    return participants.map((p) => firstName(p.userName ?? "?")).join(" · ")
  }
  const opponent = match.player1.userId === currentUserId ? match.player2 : match.player1
  return `${vsLabel} ${opponent.name}`
}
