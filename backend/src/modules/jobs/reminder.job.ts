// reminder.job.ts
// Scheduled job to send match reminders via WhatsApp.
// Runs every minute to catch reminders at their scheduled time.

import cron from 'node-cron';
import { prisma } from '../../prisma';
import { whatsappService } from '../whatsapp/whatsapp.service';
import { logger } from '../../config/logger';

function formatMatchMessage(match: {
  availability?: { locationText: string; date: Date; startTime: Date } | null;
  participants?: { userId: string; user?: { name: string | null } }[];
  type: string;
}, forUserId: string): string {
  const av = match.availability;
  const dateStr = av?.date
    ? new Date(av.date).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'short' })
    : 'TBD';
  const timeStr = av?.startTime
    ? new Date(av.startTime).toTimeString().slice(0, 5)
    : '';
  const location = av?.locationText ?? 'TBD';
  const opponents = (match.participants ?? [])
    .filter((p) => p.userId !== forUserId)
    .map((p) => p.user?.name ?? 'Opponent')
    .filter(Boolean);
  const opponentStr = opponents.length > 0 ? opponents.join(' & ') : 'your opponent';
  const typeLabel = match.type === 'competitive' ? 'Match' : 'Practice';

  return `⏰ MatchMaker Reminder\n\nYour ${typeLabel} vs ${opponentStr} is coming up!\n📅 ${dateStr}${timeStr ? ` at ${timeStr}` : ''}\n📍 ${location}\n\nSee you on court! 🎾`;
}

/**
 * Process pending reminders that are due. Send WhatsApp, mark as sent/failed.
 * Idempotent: processes each reminder once (status transition pending -> sent/failed).
 */
async function processPendingReminders() {
  const now = new Date();
  const pending = await prisma.reminder.findMany({
    where: { status: 'pending', scheduledAt: { lte: now } },
    include: {
      user: { select: { id: true, phone: true, name: true } },
      match: {
        include: {
          availability: { select: { locationText: true, date: true, startTime: true } },
          participants: { include: { user: { select: { name: true } } } },
        },
      },
    },
  });

  for (const reminder of pending) {
    try {
      const phone = reminder.user?.phone;
      if (!phone || !phone.trim()) {
        await prisma.reminder.update({
          where: { id: reminder.id },
          data: { status: 'failed', error: 'User has no phone number' },
        });
        logger.warn('ReminderSkippedNoPhone', { reminderId: reminder.id, userId: reminder.userId });
        continue;
      }

      if (reminder.match.status === 'cancelled') {
        await prisma.reminder.update({
          where: { id: reminder.id },
          data: { status: 'failed', error: 'Match was cancelled' },
        });
        logger.info('ReminderSkippedMatchCancelled', { reminderId: reminder.id });
        continue;
      }

      const message = formatMatchMessage(reminder.match, reminder.userId);
      const result = await whatsappService.sendInviteMessage(phone, message);

      if (result.success) {
        await prisma.reminder.update({
          where: { id: reminder.id },
          data: { status: 'sent', sentAt: new Date() },
        });
        logger.info('ReminderSent', { reminderId: reminder.id, userId: reminder.userId });
      } else {
        await prisma.reminder.update({
          where: { id: reminder.id },
          data: { status: 'failed', error: result.error ?? 'Unknown error' },
        });
        logger.warn('ReminderFailed', { reminderId: reminder.id, error: result.error });
      }
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      await prisma.reminder.update({
        where: { id: reminder.id },
        data: { status: 'failed', error: errMsg },
      });
      logger.error('ReminderError', { reminderId: reminder.id, error: errMsg });
    }
  }
}

export function scheduleReminderJob() {
  cron.schedule('* * * * *', async () => {
    try {
      await processPendingReminders();
    } catch (err) {
      logger.error('ReminderJobError', { error: err instanceof Error ? err.message : String(err) });
    }
  });
  logger.info('Reminder job scheduled (every minute)');
}
