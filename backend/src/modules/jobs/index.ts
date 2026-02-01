// src/modules/jobs/index.ts
// Entry point to schedule all jobs
// No WhatsApp jobs

import { scheduleCleanupExpiredInvitesJob } from './cleanup-expired-invites.job';
import { scheduleReminderJob } from './reminder.job';

export function scheduleAllJobs() {
  scheduleCleanupExpiredInvitesJob();
  scheduleReminderJob();
  // Add more jobs here as needed
}
