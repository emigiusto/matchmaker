// scheduling-expire.job.ts
// Job to expire candidates who did not respond within the timeout window

import cron from 'node-cron';
import { schedulingService } from '../scheduling/scheduling.service';
import { logger } from '../../config/logger';

/**
 * Expires scheduling candidates that are waiting_reply and were contacted
 * more than INVITE_TIMEOUT_HOURS ago.
 * Idempotent and safe to run multiple times.
 */
export function scheduleSchedulingExpireJob() {
  cron.schedule('*/15 * * * *', async () => {
    try {
      const expiredCount = await schedulingService.expireWaitingCandidates();
      if (expiredCount > 0) {
        logger.info('SchedulingExpireJob', { expiredCount });
      }
    } catch (err) {
      logger.error('SchedulingExpireJob failed', { error: err instanceof Error ? err.message : err });
    }
  });
}
