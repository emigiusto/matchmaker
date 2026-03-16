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

/**
 * A single available court slot returned by checkAvailability.
 * All entries are implicitly available — unavailable slots are omitted.
 * Adapters may extend this with optional fields (e.g. surface, indoor, price).
 */
export interface AvailableCourt {
  courtId: string      // adapter-internal identifier used for booking
  courtName: string    // human-readable display name (e.g. "PISTA 1")
  time: string         // HH:MM — start of the slot
}

/**
 * Full response from BookingAdapter.checkAvailability().
 * Covers all available slots for the queried date and sport (all hours).
 * This is the type that gets cached and returned to the frontend.
 * The frontend filters availableCourts by time to show per-hour counts.
 */
export interface CourtAvailabilityResult {
  date: string                      // YYYY-MM-DD — queried date
  sport: string                     // e.g. 'tennis' | 'padel'
  availableCourts: AvailableCourt[] // all available slots across all hours
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
