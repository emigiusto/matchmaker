import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'
import type { Match } from '@/lib/types'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function isMatchInPast(date: string, time: string): boolean {
  return new Date(`${date}T${time}`) < new Date()
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
