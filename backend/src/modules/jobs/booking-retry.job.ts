// booking-retry.job.ts
// Nightly job: retry failed court bookings for future matches.
// Targets attempts that failed with a retryable client error (excludes MISSING_SOCIO_NUMBER,
// which requires user action). Only retries when the host membership is still active.

import cron from 'node-cron';
import { retryFailedBookingsForFutureMatches } from '../booking/booking.service';
import { logger } from '../../config/logger';

async function runBookingRetryJob() {
  try {
    const count = await retryFailedBookingsForFutureMatches();
    if (count > 0) {
      logger.info('BookingRetryJob', { requeued: count });
    }
  } catch (err) {
    logger.error('BookingRetryJob failed', { error: err instanceof Error ? err.message : err });
  }
}

/**
 * Runs once daily at 02:00 UTC.
 */
export function scheduleBookingRetryJob() {
  cron.schedule('0 2 * * *', runBookingRetryJob);
  // eslint-disable-next-line no-console
  console.log('[JOBS] BookingRetryJob: cron daily at 02:00 UTC');
}
