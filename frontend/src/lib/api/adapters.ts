/**
 * Adapters to map backend API responses to frontend types.
 * Backend DTOs may have different shapes; these functions normalize them.
 */

import type { Match, Player, Invite, Notification } from "@/lib/types"

// Backend participant (from MatchDTO)
export interface BackendMatchParticipantDTO {
  userId: string
  team: "A" | "B" | null
  userName?: string
}

// Backend MatchDTO shape (from /matches endpoints)
export interface BackendMatchDTO {
  id: string
  participants: BackendMatchParticipantDTO[]
  scheduledAt: string
  status: string
  type: "competitive" | "practice"
  availabilityId?: string | null
  playerAId?: string | null
  playerBId?: string | null
  location?: string
  date?: string
  time?: string
  sportType?: "tennis" | "padel"
  format?: "singles" | "doubles"
}

// Backend InviteDTO shape (from /invites endpoints)
export interface BackendInviteDTO {
  id: string
  token: string
  status: string
  availabilityId: string
  inviterUserId: string
  matchType: "competitive" | "practice"
  createdAt: string
  expiresAt?: string
  matchId?: string | null
  location?: string
  date?: string
  time?: string
  fromPlayerName?: string
  fromPlayerLevel?: number
  fromPlayerCity?: string
  visibility?: "private" | "community"
}

// Backend NotificationDTO shape
export interface BackendNotificationDTO {
  id: string
  userId: string
  type: string
  payload?: Record<string, unknown>
  readAt: string | null
  createdAt: string
}

/**
 * Map backend invite status to frontend
 */
function mapInviteStatus(status: string): "pending" | "accepted" | "declined" | "expired" {
  if (status === "cancelled") return "declined"
  if (status === "accepted" || status === "pending" || status === "expired") return status
  return "pending"
}

/** Extended invite for UI (includes optional display fields from backend) */
export type InviteWithDetails = Invite & {
  fromPlayerLevel?: number
  fromPlayerCity?: string
  fromPlayerMatches?: number
  fromPlayerWins?: number
  message?: string
}

/**
 * Map backend InviteDTO to frontend Invite
 */
export function adaptInvite(dto: BackendInviteDTO & { message?: string; fromPlayerMatches?: number; fromPlayerWins?: number }): InviteWithDetails {
  return {
    id: dto.id,
    token: dto.token,
    fromUserId: dto.inviterUserId,
    fromPlayerName: dto.fromPlayerName ?? "Unknown",
    toUserId: undefined,
    availabilityId: dto.availabilityId,
    matchType: dto.matchType,
    date: dto.date ?? "",
    time: dto.time ?? "",
    location: dto.location ?? "",
    status: mapInviteStatus(dto.status),
    isOpen: dto.visibility === "community",
    createdAt: dto.createdAt,
    fromPlayerLevel: dto.fromPlayerLevel,
    fromPlayerCity: dto.fromPlayerCity,
    fromPlayerMatches: dto.fromPlayerMatches,
    fromPlayerWins: dto.fromPlayerWins,
    message: dto.message,
  }
}

const BACKEND_TO_FRONTEND_TYPE: Record<string, Notification["type"]> = {
  "invite.accepted": "invite_accepted",
  "invite_received": "invite_received",
  "match.created": "invite_accepted",
  "match.completed": "match_completed",
  "match.cancelled": "match_cancelled",
  "scheduling.no_match": "scheduling_no_match",
  "result_pending": "result_pending",
  "rating_change": "rating_change",
}

function deriveNotificationTitle(type: string, payload: Record<string, unknown>): string {
  if (payload.title && typeof payload.title === "string") return payload.title
  switch (type) {
    case "invite.accepted":
      return "Invite accepted"
    case "match.created":
      return "Match confirmed"
    case "match.completed":
      return "Match completed"
    case "match.cancelled":
      return "Match cancelled"
    case "invite_received":
      return "New invite"
    case "result_pending":
      return "Result pending"
    case "rating_change":
      return "Rating updated"
    case "scheduling.no_match":
      return "No players found"
    default:
      return type.replace(/\./g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
  }
}

function deriveNotificationMessage(type: string, payload: Record<string, unknown>): string {
  if (payload.message && typeof payload.message === "string") return payload.message
  const scheduledAt = payload.scheduledAt
  const dateStr =
    scheduledAt && typeof scheduledAt === "string"
      ? new Date(scheduledAt).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })
      : (payload.date && typeof payload.date === "string"
          ? new Date(payload.date).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })
          : null)
  const timeStr = payload.time && typeof payload.time === "string" ? payload.time : null
  const location = payload.location && typeof payload.location === "string" ? payload.location.trim() : null
  const opponents = payload.opponentNames && typeof payload.opponentNames === "string" ? payload.opponentNames : null

  switch (type) {
    case "invite.accepted":
      return dateStr ? `A match was scheduled for ${dateStr}.` : "A match was scheduled."
    case "match.created": {
      const parts: string[] = []
      if (opponents) parts.push(`vs ${opponents}`)
      if (dateStr) parts.push(dateStr)
      if (timeStr) parts.push(`at ${timeStr}`)
      if (location) parts.push(`· ${location}`)
      return parts.length > 0 ? parts.join(" ") : "Your match was scheduled."
    }
    case "match.completed":
      return "Your match result was confirmed."
    case "match.cancelled": {
      const parts: string[] = []
      if (opponents) parts.push(`vs ${opponents}`)
      if (dateStr) parts.push(dateStr)
      if (timeStr) parts.push(`at ${timeStr}`)
      if (location) parts.push(`· ${location}`)
      return parts.length > 0 ? parts.join(" · ") + " was cancelled." : "Your match was cancelled."
    }
    case "scheduling.no_match": {
      const sportType = payload.sportType && typeof payload.sportType === "string" ? payload.sportType : null
      const format = payload.format && typeof payload.format === "string" ? payload.format : null
      const sportLabel = sportType
        ? `${sportType.charAt(0).toUpperCase()}${sportType.slice(1)}${format ? ` ${format}` : ""}`
        : null
      const reason = payload.reason && typeof payload.reason === "string" ? payload.reason : null
      const reasonText =
        reason === "scheduled_time_passed"
          ? "The match time passed before enough players confirmed."
          : "None of your contacts accepted in time."
      const parts: string[] = []
      if (sportLabel) parts.push(sportLabel)
      if (dateStr) parts.push(dateStr)
      if (timeStr) parts.push(`at ${timeStr}`)
      if (location) parts.push(`· ${location}`)
      const header = parts.length > 0 ? `Your ${parts.join(" ")} invite didn't find a match.` : "Your invite didn't find a match."
      return `${header} ${reasonText}`
    }
    case "invite_received":
      return "You received a new match invite."
    case "result_pending":
      return "A result is awaiting your confirmation."
    case "rating_change":
      return "Your rating was updated."
    default:
      return ""
  }
}

/**
 * Map backend NotificationDTO to frontend Notification
 */
export function adaptNotification(dto: BackendNotificationDTO): Notification {
  const payload = (dto.payload ?? {}) as Record<string, unknown>
  const frontendType = BACKEND_TO_FRONTEND_TYPE[dto.type] ?? ("invite_accepted" as Notification["type"])
  return {
    id: dto.id,
    userId: dto.userId,
    type: frontendType,
    title: deriveNotificationTitle(dto.type, payload),
    message: deriveNotificationMessage(dto.type, payload),
    read: !!dto.readAt,
    createdAt: dto.createdAt,
    metadata: Object.fromEntries(
      Object.entries(payload).map(([k, v]) => [k, typeof v === "string" ? v : JSON.stringify(v)])
    ),
  }
}

/**
 * Create a minimal Player from backend data (when full player not available)
 */
type PlayerInput = Partial<Player> & { defaultCity?: string }
function minimalPlayer(
  userId: string,
  playerId: string,
  name: string,
  dto?: PlayerInput
): Player {
  return {
    id: playerId,
    userId,
    name: dto?.name ?? name,
    city: dto?.city ?? dto?.defaultCity ?? "",
    latitude: dto?.latitude ?? 0,
    longitude: dto?.longitude ?? 0,
    levelValue: dto?.levelValue ?? 0,
    levelConfidence: dto?.levelConfidence ?? 0,
    rating: dto?.rating ?? 0,
    matchesPlayed: dto?.matchesPlayed ?? 0,
    wins: dto?.wins ?? 0,
    losses: dto?.losses ?? 0,
    ...dto,
  }
}

/**
 * Map backend MatchDTO to frontend Match.
 * Derives player1/player2 from participants (team A rep, team B rep, or first two if no teams).
 */
export function adaptMatch(dto: BackendMatchDTO): Match {
  const scheduled = new Date(dto.scheduledAt)
  const dateStr = dto.date ?? scheduled.toISOString().slice(0, 10)
  const timeStr = dto.time ?? scheduled.toTimeString().slice(0, 5)

  const participants = dto.participants ?? []
  const teamA = participants.filter((p) => p.team === "A")
  const teamB = participants.filter((p) => p.team === "B")
  const isDoubles = participants.length >= 4
  const hasKnownTeams = teamA.length > 0 && teamB.length > 0
  const showVsLayout = !isDoubles || hasKnownTeams

  // Use team reps when assigned, otherwise first two participants
  const p1 = teamA.length > 0 ? teamA[0] : participants[0]
  const p2 = teamB.length > 0 ? teamB[0] : participants[1]
  const userId1 = p1?.userId ?? "unknown"
  const userId2 = p2?.userId ?? "unknown"
  const name1 = p1?.userName ?? "Participant 1"
  const name2 = p2?.userName ?? "Participant 2"

  const player1 = minimalPlayer(
    userId1,
    dto.playerAId ?? userId1,
    name1,
    undefined
  )
  const player2 = minimalPlayer(
    userId2,
    dto.playerBId ?? userId2,
    name2,
    undefined
  )

  const sport = (dto.sportType === "padel" || dto.sportType === "tennis" ? dto.sportType : "tennis") as "tennis" | "padel"
  const format = (dto.format === "doubles" || dto.format === "singles" ? dto.format : participants.length >= 4 ? "doubles" : "singles") as "singles" | "doubles"

  return {
    id: dto.id,
    player1,
    player2,
    date: dateStr,
    time: timeStr,
    location: dto.location ?? "",
    matchType: dto.type,
    status: dto.status as Match["status"],
    participants: participants.map((p) => ({ userId: p.userId, userName: p.userName, team: p.team })),
    showVsLayout,
    sport,
    format,
  }
}
