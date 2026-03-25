// results-autoconfirm.job.ts
// Nightly job: auto-confirm results that have been awaiting confirmation for >= 7 days.
// If neither participant confirmed (or only one did) within 7 days and no dispute was filed,
// the result is automatically confirmed and ratings are updated.

import cron from 'node-cron';
import { autoConfirmResults } from '../results/results.service';
import { logger } from '../../config/logger';

async function runAutoConfirmJob() {
  try {
    const count = await autoConfirmResults();
    if (count > 0) {
      logger.info('ResultsAutoConfirmJob', { autoConfirmed: count });
    }
  } catch (err) {
    logger.error('ResultsAutoConfirmJob failed', { error: err instanceof Error ? err.message : err });
  }
}

/**
 * Runs once daily at 02:00 UTC.
 * In development, can be forced to run every minute via AUTOCONFIRM_INTERVAL_SECONDS env var.
 */
export function scheduleResultsAutoConfirmJob() {
  const intervalSec = process.env.AUTOCONFIRM_INTERVAL_SECONDS;
  if (intervalSec) {
    const sec = Math.max(60, parseInt(intervalSec, 10));
    setInterval(runAutoConfirmJob, sec * 1000);
    runAutoConfirmJob();
    // eslint-disable-next-line no-console
    console.log('[JOBS] ResultsAutoConfirmJob: setInterval every', sec, 's');
  } else {
    cron.schedule('0 2 * * *', runAutoConfirmJob);
    // eslint-disable-next-line no-console
    console.log('[JOBS] ResultsAutoConfirmJob: cron daily at 02:00 UTC');
  }
}
