// booking.types.ts

export interface ClubCredentials {
  socioNumber: string
  password: string
}

export interface Court {
  id: string
  name: string
  sport: string
  surface?: string
}

export interface BookingSlot {
  courtId: string
  courtName: string
  date: string   // YYYY-MM-DD
  time: string   // HH:MM
  available: boolean
}

export interface BookingResult {
  externalId: string
  courtName: string
  confirmationUrl?: string
}

export interface ClubMembershipDTO {
  id: string
  userId: string
  clubSlug: string
  adapterType: string
  socioNumber: string
  hasPassword: boolean   // never expose the password
  status: string
  lastVerifiedAt: string | null
  createdAt: string
}

export interface UpsertClubMembershipInput {
  userId: string
  clubSlug: string
  adapterType: string
  socioNumber: string
  password?: string   // optional - only for hosts
}

export interface BookingAttemptDTO {
  id: string
  matchId: string
  clubMembershipId: string
  status: string
  externalBookingId: string | null
  courtName: string | null
  errorMessage: string | null
  attemptedAt: string
  completedAt: string | null
}
