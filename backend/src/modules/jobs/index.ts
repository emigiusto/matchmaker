// src/modules/jobs/index.ts
// Entry point to schedule all jobs
import { scheduleReminderJob } from './reminder.job';
import { scheduleSchedulingExpireJob } from './scheduling-expire.job';
import { scheduleAvailabilityCacheJob } from './availability-cache.job';
import { scheduleResultsAutoConfirmJob } from './results-autoconfirm.job';

export function scheduleAllJobs() {
  scheduleReminderJob();
  scheduleSchedulingExpireJob();
  scheduleAvailabilityCacheJob();
  scheduleResultsAutoConfirmJob();
}
