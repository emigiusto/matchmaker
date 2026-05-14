import { apiClient } from "./api-client"

export interface AdditionalDateEntry {
  date: string      // YYYY-MM-DD
  startTime: string // HH:MM
  endTime: string   // HH:MM
}

export interface CourtAvailabilitySlot {
  date: string
  startTime: string
  endTime: string
  courtsPerSlot: Record<string, number>
  hasAvailability: boolean | null
}

export interface PublicSchedulingInviteDTO {
  id: string
  hostName: string
  sportType: 'tennis' | 'padel'
  format: 'singles' | 'doubles'
  matchType: 'competitive' | 'practice'
  date: string
  startTime: string
  locationText: string
  status: string
  bookingEnabled: boolean
  matchId: string | null
}

export type SchedulingRequestStatus = "active" | "completed" | "expired" | "cancelled"
export type SchedulingCandidateStatus =
  | "pending"
  | "contacted"
  | "waiting_reply"
  | "responded"
  | "accepted"
  | "declined"
  | "expired"
  | "cancelled"
  | "send_failed"

export interface SchedulingCandidateDTO {
  id: string
  schedulingRequestId: string
  contactUserId: string
  contactUserName?: string | null
  contactPhone?: string | null
  priorityOrder: number
  status: SchedulingCandidateStatus
  contactedAt: string | null
  responseAt: string | null
  createdAt: string
  updatedAt: string
}

export interface SchedulingRequestDTO {
  id: string
  hostUserId: string
  hostPartnerUserId: string | null
  sportType: "tennis" | "padel"
  format: "singles" | "doubles"
  matchType: "competitive" | "practice"
  date: string
  additionalDates: AdditionalDateEntry[] | null
  startTime: string
  endTime: string
  locationText: string
  radiusKm: number | null
  inviteToken: string
  status: SchedulingRequestStatus
  currentCandidateIndex: number
  matchId: string | null
  whatsappGroupId: string | null
  noCourtsAtQuorum: boolean
  createdAt: string
  updatedAt: string
  candidates?: SchedulingCandidateDTO[]
}

export interface CreateSchedulingRequestInput {
  hostUserId: string
  sportType: "tennis" | "padel"
  format: "singles" | "doubles"
  matchType: "competitive" | "practice"
  date: string
  startTime: string
  endTime: string
  locationText: string
  radiusKm?: number | null
  hostPartnerUserId?: string | null
  candidateUserIds: string[]
  bookingEnabled?: boolean
  timezone?: string
  additionalDates?: AdditionalDateEntry[]
}

export type SchedulingInviteEventAction =
  | 'invite_sent'
  | 'invite_accepted'
  | 'invite_manually_accepted'
  | 'invite_declined'
  | 'invite_expired'
  | 'invite_link_accepted'
  | 'candidate_cancelled'
  | 'candidate_retried'
  | 'candidates_added'
  | 'request_started'
  | 'request_cancelled'
  | 'request_completed'
  | 'request_expired'
  | 'booking_pending'
  | 'booking_success'
  | 'booking_failed'
  | 'booking_cancelled'
  | 'poll_vote'
  | 'no_courts_at_quorum'

export interface SchedulingInviteEventDTO {
  id: string
  schedulingRequestId: string
  candidateId: string | null
  candidateUserName: string | null
  actorUserId: string | null
  actorUserName: string | null
  action: SchedulingInviteEventAction
  metadata: Record<string, unknown> | null
  createdAt: string
}

export const schedulingService = {
  async create(input: CreateSchedulingRequestInput): Promise<SchedulingRequestDTO> {
    return apiClient.post<SchedulingRequestDTO>("/scheduling", input)
  },

  async start(requestId: string): Promise<SchedulingRequestDTO | null> {
    return apiClient.post<SchedulingRequestDTO>(`/scheduling/${requestId}/start`)
  },

  async listByHost(hostUserId: string): Promise<SchedulingRequestDTO[]> {
    return apiClient.get<SchedulingRequestDTO[]>("/scheduling", { hostUserId })
  },

  async listIncoming(userId: string): Promise<SchedulingRequestDTO[]> {
    return apiClient.get<SchedulingRequestDTO[]>("/scheduling/incoming", { userId })
  },

  async getActiveCount(hostUserId: string): Promise<{ active: number; max: number }> {
    return apiClient.get<{ active: number; max: number }>("/scheduling/active-count", {
      hostUserId,
    })
  },

  async addCandidates(
    requestId: string,
    candidateUserIds: string[],
    userId: string
  ): Promise<SchedulingRequestDTO> {
    return apiClient.post<SchedulingRequestDTO>(
      `/scheduling/${requestId}/candidates`,
      { userId, candidateUserIds }
    )
  },

  async cancelContacted(
    requestId: string,
    candidateId: string,
    userId: string
  ): Promise<SchedulingRequestDTO> {
    return apiClient.post<SchedulingRequestDTO>(
      `/scheduling/${requestId}/cancel-contacted/${candidateId}`,
      { userId }
    )
  },

  async removeCandidate(
    requestId: string,
    candidateId: string,
    userId: string
  ): Promise<SchedulingRequestDTO> {
    return apiClient.post<SchedulingRequestDTO>(
      `/scheduling/${requestId}/remove/${candidateId}`,
      { userId }
    )
  },

  async cancelAccepted(
    requestId: string,
    candidateId: string,
    userId: string
  ): Promise<SchedulingRequestDTO> {
    return apiClient.post<SchedulingRequestDTO>(
      `/scheduling/${requestId}/cancel-accepted/${candidateId}`,
      { userId }
    )
  },

  async manualAccept(requestId: string, candidateId: string, userId: string): Promise<SchedulingRequestDTO> {
    return apiClient.post<SchedulingRequestDTO>(
      `/scheduling/${requestId}/accept/${candidateId}`,
      { userId }
    )
  },

  async retry(requestId: string, candidateId: string, userId: string): Promise<SchedulingRequestDTO> {
    return apiClient.post<SchedulingRequestDTO>(
      `/scheduling/${requestId}/retry/${candidateId}`,
      { userId }
    )
  },

  async cancel(requestId: string, userId: string): Promise<SchedulingRequestDTO> {
    return apiClient.post<SchedulingRequestDTO>(`/scheduling/${requestId}/cancel`, {
      userId,
    })
  },

  async checkQuorum(requestId: string, userId: string): Promise<SchedulingRequestDTO> {
    return apiClient.post<SchedulingRequestDTO>(`/scheduling/${requestId}/check-quorum`, { userId })
  },

  async getById(requestId: string): Promise<SchedulingRequestDTO | null> {
    return apiClient.get<SchedulingRequestDTO>(`/scheduling/${requestId}`)
  },

  async getEvents(requestId: string): Promise<SchedulingInviteEventDTO[]> {
    return apiClient.get<SchedulingInviteEventDTO[]>(`/scheduling/${requestId}/events`)
  },

  async getCourtAvailability(requestId: string): Promise<CourtAvailabilitySlot[]> {
    return apiClient.get<CourtAvailabilitySlot[]>(`/scheduling/${requestId}/court-availability`)
  },

  async getInviteLink(requestId: string, baseUrl?: string): Promise<string> {
    const params = baseUrl ? { baseUrl } : undefined
    const res = await apiClient.get<{ inviteLink: string }>(
      `/scheduling/${requestId}/invite-link`,
      params
    )
    return res.inviteLink
  },

  async getForJoin(token: string): Promise<PublicSchedulingInviteDTO | null> {
    try {
      return await apiClient.get<PublicSchedulingInviteDTO>(`/scheduling/join/${token}`)
    } catch {
      return null
    }
  },

  async acceptViaLink(
    token: string,
    data: { name: string; phone: string; email?: string; socioNumber?: string }
  ): Promise<{ status: 'accepted' | 'already_filled'; matchId: string | null; candidateId: string | null }> {
    return apiClient.post<{ status: 'accepted' | 'already_filled'; matchId: string | null; candidateId: string | null }>(
      `/scheduling/join/${token}/accept`,
      data
    )
  },
}
