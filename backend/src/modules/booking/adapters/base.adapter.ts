// base.adapter.ts
// Interface that all club booking adapters must implement.
// Adapters can use Puppeteer, REST API, SOAP, or any other method.

import type { ClubCredentials, CourtAvailabilityResult, BookingResult } from '../booking.types'

export interface BookingAdapter {
  /**
   * Verify credentials are valid. Returns true if login succeeds.
   */
  testConnection(creds: ClubCredentials): Promise<boolean>

  /**
   * Return available courts for a given date and sport.
   * If time is omitted, all hours for the day are returned (preferred for caching).
   * If time is provided, results are filtered to that hour (used internally by the booking job).
   * Only available courts are included — the result is safe to cache.
   */
  checkAvailability(
    creds: ClubCredentials,
    date: string,    // YYYY-MM-DD
    time?: string,   // HH:MM — omit to get all hours
    options?: { sport?: string },
  ): Promise<CourtAvailabilityResult>

  /**
   * Book a court. Returns booking confirmation details.
   * participantSocioNumbers: socio numbers of OTHER participants (not the host)
   */
  book(
    creds: ClubCredentials,
    date: string,
    time: string,
    courtId: string,
    participantSocioNumbers: string[],
    options?: { sport?: string },
  ): Promise<BookingResult>

  /**
   * Cancel an existing booking by its external ID.
   */
  cancel(creds: ClubCredentials, externalBookingId: string): Promise<void>
}
