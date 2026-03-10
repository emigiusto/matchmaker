/**
 * Adapters to map backend API responses to frontend types.
 * Backend DTOs may have different shapes; these functions normalize them.
 */

import type { Match, Player, Invite, Notification } from "@/lib/types"

// Backend MatchDTO shape (from /matches endpoints)
export interface BackendMatchDTO {
  id: string
  hostUserId: string
  opponentUserId: string
  scheduledAt: string
  status: string
  type: "competitive" | "practice"
  availabilityId?: string | null
  playerAId?: string | null
  playerBId?: string | null
  location?: string
  date?: string
  time?: string
  hostName?: string
  opponentName?: string
  hostPlayer?: Partial<Player>
  opponentPlayer?: Partial<Player>
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
    isOpen: false,
    createdAt: dto.createdAt,
    fromPlayerLevel: dto.fromPlayerLevel,
    fromPlayerCity: dto.fromPlayerCity,
    fromPlayerMatches: dto.fromPlayerMatches,
    fromPlayerWins: dto.fromPlayerWins,
    message: dto.message,
  }
}

/**
 * Map backend NotificationDTO to frontend Notification
 */
export function adaptNotification(dto: BackendNotificationDTO): Notification {
  const payload = (dto.payload ?? {}) as Record<string, unknown>
  return {
    id: dto.id,
    userId: dto.userId,
    type: dto.type as Notification["type"],
    title: (payload.title as string) ?? dto.type,
    message: (payload.message as string) ?? "",
    read: !!dto.readAt,
    createdAt: dto.createdAt,
    metadata: payload as Record<string, string>,
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
 * Uses enriched fields (location, date, time, hostName, opponentName) from backend.
 */
export function adaptMatch(dto: BackendMatchDTO): Match {
  const scheduled = new Date(dto.scheduledAt)
  const dateStr = dto.date ?? scheduled.toISOString().slice(0, 10)
  const timeStr = dto.time ?? scheduled.toTimeString().slice(0, 5)

  const hostP = minimalPlayer(
    dto.hostUserId,
    dto.playerAId ?? dto.hostUserId,
    dto.hostName ?? "Host",
    dto.hostPlayer as PlayerInput | undefined
  )
  const oppP = minimalPlayer(
    dto.opponentUserId,
    dto.playerBId ?? dto.opponentUserId,
    dto.opponentName ?? "Opponent",
    dto.opponentPlayer as PlayerInput | undefined
  )

  return {
    id: dto.id,
    player1: hostP,
    player2: oppP,
    date: dateStr,
    time: timeStr,
    location: dto.location ?? "",
    matchType: dto.type,
    status: dto.status as Match["status"],
  }
}
