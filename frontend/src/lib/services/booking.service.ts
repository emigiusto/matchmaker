import { apiClient } from "./api-client"

export interface AvailableCourt {
  courtId: string
  courtName: string
  time: string   // HH:MM — start of the slot
}

export interface CourtAvailabilityResult {
  date: string
  sport: string
  availableCourts: AvailableCourt[]
}

export interface BookingAttemptDTO {
  id: string
  matchId: string
  clubMembershipId: string
  status: "pending" | "success" | "failed" | "cancelled"
  externalBookingId: string | null
  courtName: string | null
  errorMessage: string | null
  errorCode: string | null
  attemptedAt: string
  completedAt: string | null
}

export interface ClubMembershipDTO {
  id: string
  userId: string
  clubSlug: string
  adapterType: string
  socioNumber: string
  hasPassword: boolean
  status: "unverified" | "active" | "invalid_credentials"
  lastVerifiedAt: string | null
  createdAt: string
}

export const SUPPORTED_CLUBS = [
  { clubSlug: "laieta", label: "Club Sportiu Laieta", adapterType: "miclubonline" },
] as const

export const bookingService = {
  async listMemberships(userId: string): Promise<ClubMembershipDTO[]> {
    return apiClient.get<ClubMembershipDTO[]>("/booking/memberships", { userId })
  },

  async upsertMembership(data: {
    userId: string
    clubSlug: string
    adapterType: string
    socioNumber: string
    password?: string
  }): Promise<ClubMembershipDTO> {
    return apiClient.put<ClubMembershipDTO>("/booking/memberships", data)
  },

  async deleteMembership(userId: string, clubSlug: string): Promise<void> {
    return apiClient.delete(`/booking/memberships/${clubSlug}?userId=${userId}`)
  },

  async testConnection(userId: string, clubSlug: string): Promise<boolean> {
    const res = await apiClient.post<{ success: boolean }>(
      `/booking/memberships/${clubSlug}/test?userId=${userId}`,
      {}
    )
    return res.success
  },

  async getAttempt(matchId: string): Promise<BookingAttemptDTO | null> {
    try {
      return await apiClient.get<BookingAttemptDTO>(`/booking/attempts/${matchId}`)
    } catch {
      return null
    }
  },

  async retryBooking(matchId: string): Promise<void> {
    await apiClient.post(`/booking/attempts/${matchId}/retry`, {})
  },

  async cancelBooking(matchId: string): Promise<void> {
    await apiClient.post(`/booking/attempts/${matchId}/cancel`, {})
  },

  async checkAvailability(params: {
    userId: string
    clubSlug: string
    date: string   // YYYY-MM-DD
    sport: string  // 'tennis' | 'padel'
  }): Promise<CourtAvailabilityResult> {
    return apiClient.get<CourtAvailabilityResult>("/booking/availability", params)
  },
}
