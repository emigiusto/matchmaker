// scheduling-expire.job.ts
// Job to expire candidates who did not respond within the timeout window

import cron from 'node-cron';
import { schedulingService } from '../scheduling/scheduling.service';
import { logger } from '../../config/logger';

async function runExpireJob() {
  try {
    const [expiredCandidates, expiredRequests] = await Promise.all([
      schedulingService.expireWaitingCandidates(),
      schedulingService.expireRequestsPastScheduledTime(),
    ]);
    if (expiredCandidates > 0 || expiredRequests > 0) {
      //logger.info('SchedulingExpireJob', { expiredCandidates, expiredRequests });
    }
  } catch (err) {
    logger.error('SchedulingExpireJob failed', { error: err instanceof Error ? err.message : err });
  }
}

/**
 * 1. Expires scheduling candidates that are waiting_reply and were contacted
 *    more than responseWindowMinutes ago.
 * 2. Expires scheduling requests whose scheduled date+startTime has passed.
 * Idempotent and safe to run multiple times.
 *
 * In development: setInterval every 10 sec (reliable for short timeouts).
 * In production: cron every 15 min.
 */
export function scheduleSchedulingExpireJob() {
  const intervalSec = process.env.SCHEDULING_EXPIRE_INTERVAL_SECONDS;
  const isDev = process.env.ENVIRONMENT === 'DEVELOPMENT';

  if (intervalSec || isDev) {
    const sec = intervalSec ? parseInt(intervalSec, 10) : 10;
    const ms = Math.max(5000, sec * 1000); // min 5 sec
    // eslint-disable-next-line no-console
    console.log('[JOBS] SchedulingExpireJob: setInterval every', sec, 's');
    runExpireJob(); // run immediately once
    setInterval(runExpireJob, ms);
  } else {
    cron.schedule('*/10 * * * *', runExpireJob);
    // eslint-disable-next-line no-console
    console.log('[JOBS] SchedulingExpireJob: cron every 10 min');
  }
}
