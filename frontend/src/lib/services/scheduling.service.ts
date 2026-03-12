import { apiClient } from "./api-client"

export type SchedulingRequestStatus = "active" | "completed" | "expired" | "cancelled"
export type SchedulingCandidateStatus =
  | "pending"
  | "contacted"
  | "waiting_reply"
  | "accepted"
  | "declined"
  | "expired"
  | "cancelled"

export interface SchedulingCandidateDTO {
  id: string
  schedulingRequestId: string
  contactUserId: string
  contactUserName?: string | null
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
  startTime: string
  endTime: string
  locationText: string
  radiusKm: number | null
  responseWindowMinutes: number
  inviteToken: string
  status: SchedulingRequestStatus
  currentCandidateIndex: number
  matchId: string | null
  whatsappGroupId: string | null
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
  responseWindowMinutes: number
  maxParallelCandidates?: number
  hostPartnerUserId?: string | null
  candidateUserIds: string[]
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

  async getInviteLink(requestId: string, baseUrl?: string): Promise<string> {
    const params = baseUrl ? { baseUrl } : undefined
    const res = await apiClient.get<{ inviteLink: string }>(
      `/scheduling/${requestId}/invite-link`,
      params
    )
    return res.inviteLink
  },
}
