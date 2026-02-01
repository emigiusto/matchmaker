// src/modules/jobs/cleanup-expired-invites.job.ts
// Scheduled job to clean up expired invites
// Uses node-cron. Job must be safe and idempotent.
// TODO: Implement logic to find and clean up expired invites


import cron from 'node-cron';
import prisma from '../../config/database';

/**
 * Scheduled job to mark all expired invites as expired.
 * Idempotent: safe to run multiple times.
 * Runs every hour.
 */
export function scheduleCleanupExpiredInvitesJob() {
  cron.schedule('0 * * * *', async () => {
    try {
      const now = new Date();
      // Only update invites that are still pending and expired
      const result = await prisma.invite.updateMany({
        where: {
          status: 'pending',
          expiresAt: { lt: now },
        },
        data: { status: 'expired' },
      });
      // eslint-disable-next-line no-console
      console.log(`[CRON] Marked ${result.count} invites as expired at ${now.toISOString()}`);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[CRON] Failed to cleanup expired invites', err);
    }
  });
}
