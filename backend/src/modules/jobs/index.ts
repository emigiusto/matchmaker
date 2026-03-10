// src/modules/jobs/index.ts
// Entry point to schedule all jobs
import { scheduleReminderJob } from './reminder.job';
import { scheduleSchedulingExpireJob } from './scheduling-expire.job';

export function scheduleAllJobs() {
  scheduleReminderJob();
  scheduleSchedulingExpireJob();
}
