// base.adapter.ts
// Interface that all club booking adapters must implement.
// Adapters can use Puppeteer, REST API, SOAP, or any other method.

import type { ClubCredentials, BookingSlot, BookingResult } from '../booking.types'

export interface BookingAdapter {
  /**
   * Verify credentials are valid. Returns true if login succeeds.
   */
  testConnection(creds: ClubCredentials): Promise<boolean>

  /**
   * Return available court slots for a given date and time window.
   */
  checkAvailability(
    creds: ClubCredentials,
    date: string,   // YYYY-MM-DD
    time: string,   // HH:MM
    options?: { sport?: string },
  ): Promise<BookingSlot[]>

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
