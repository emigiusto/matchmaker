import { apiClient } from "./api-client"
import type { Invite } from "../types"

export interface InviteEventDTO {
  id: string
  inviteId: string
  action: string
  actorUserId: string | null
  metadata: Record<string, unknown> | null
  createdAt: string
}

export interface CreateInviteDto {
  fromUserId: string
  toUserId?: string
  availabilityId?: string
  matchType: "competitive" | "practice"
  date: string
  time: string
  location: string
  isOpen: boolean
}

export const invitesService = {
  async getByToken(token: string): Promise<Invite> {
    return apiClient.get<Invite>(`/invites/${token}`)
  },

  async getAll(): Promise<Invite[]> {
    return apiClient.get<Invite[]>("/invites")
  },

  async getOpenInvites(): Promise<Invite[]> {
    return apiClient.get<Invite[]>("/invites/open")
  },

  async getByUser(userId: string): Promise<Invite[]> {
    return apiClient.get<Invite[]>(`/invites/by-user/${userId}`)
  },

  async create(data: CreateInviteDto): Promise<Invite> {
    return apiClient.post<Invite>("/invites", data)
  },

  async accept(token: string, acceptorUserId: string): Promise<Invite> {
    return apiClient.post<Invite>(`/invites/${token}/confirm`, { acceptorUserId })
  },

  async decline(token: string): Promise<Invite> {
    return apiClient.post<Invite>(`/invites/${token}/decline`)
  },

  async getEvents(inviteId: string): Promise<InviteEventDTO[]> {
    return apiClient.get<InviteEventDTO[]>(`/invites/by-id/${inviteId}/events`)
  },
}
