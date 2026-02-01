// src/modules/jobs/reminder.job.ts
// Scheduled job to send reminders
// Uses node-cron. Job must be safe and idempotent.
// TODO: Implement logic to send reminders (no WhatsApp jobs)


import cron from 'node-cron';

/**
 * Placeholder for reminder job (e.g., send reminders for upcoming matches).
 * Idempotent and safe to run multiple times.
 * No WhatsApp jobs.
 * Runs every hour at minute 30.
 */
export function scheduleReminderJob() {
  cron.schedule('30 * * * *', async () => {
    // TODO: Implement reminder logic (e.g., email/calendar reminders)
    // This job is safe and idempotent
    // eslint-disable-next-line no-console
    console.log('[CRON] Reminder job ran (placeholder)');
  });
}
