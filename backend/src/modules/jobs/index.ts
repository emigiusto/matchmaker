// src/modules/jobs/index.ts
// Entry point to schedule all jobs
// No WhatsApp jobs
import { scheduleReminderJob } from './reminder.job';

export function scheduleAllJobs() {
  scheduleReminderJob();
  // Add more jobs here as needed
}
