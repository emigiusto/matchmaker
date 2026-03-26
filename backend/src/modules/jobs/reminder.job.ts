// reminder.job.ts
// Scheduled job to send match reminders via WhatsApp.
// Runs every minute to catch reminders at their scheduled time.

import cron from 'node-cron';
import { prisma } from '../../prisma';
import { whatsappService } from '../whatsapp/whatsapp.service';
import { logger } from '../../config/logger';
import { getMessages, resolveLocale } from '../../lib/whatsapp-messages';

/**
 * Process pending reminders that are due. Send WhatsApp, mark as sent/failed.
 * Idempotent: processes each reminder once (status transition pending -> sent/failed).
 */
async function processPendingReminders() {
  const now = new Date();
  const pending = await prisma.reminder.findMany({
    where: { status: 'pending', scheduledAt: { lte: now } },
    include: {
      user: { select: { id: true, phone: true, name: true, locale: true } },
      match: {
        include: {
          availability: { select: { locationText: true, date: true, startTime: true } },
          participants: { include: { user: { select: { name: true } } } },
          schedulingRequest: { select: { timezone: true } },
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

      // Only send reminders for matches that are confirmed (scheduled or awaiting confirmation)
      const sendableStatuses = ['scheduled', 'awaiting_confirmation'];
      if (!sendableStatuses.includes(reminder.match.status)) {
        const errorMsg =
          reminder.match.status === 'cancelled'
            ? 'Match was cancelled'
            : 'Match is no longer scheduled';
        await prisma.reminder.update({
          where: { id: reminder.id },
          data: { status: 'failed', error: errorMsg },
        });
        //logger.info('ReminderSkippedMatchNotConfirmed', {
        //  reminderId: reminder.id,
        //  matchStatus: reminder.match.status,
        //});
        continue;
      }

      const userLocale = (reminder.user as any)?.locale ?? 'es';
      const intlLocale = resolveLocale(userLocale) === 'es' ? 'es-ES' : 'en-US';
      const av = reminder.match.availability;
      const tz = (reminder.match as any).schedulingRequest?.timezone ?? 'UTC';
      const dateStr = av?.date
        ? new Date(av.date).toLocaleDateString(intlLocale, { weekday: 'long', day: 'numeric', month: 'short', timeZone: tz })
        : 'TBD';
      const timeStr = av?.startTime
        ? new Date(av.startTime).toLocaleTimeString(intlLocale, { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: tz })
        : '';
      const location = av?.locationText ?? 'TBD';
      const opponents = (reminder.match.participants ?? [])
        .filter((p) => p.userId !== reminder.userId)
        .map((p) => p.user?.name ?? 'Opponent')
        .filter(Boolean);
      const opponentStr = opponents.length > 0 ? opponents.join(' & ') : (resolveLocale(userLocale) === 'es' ? 'tu rival' : 'your opponent');
      const whenStr = `${dateStr}${timeStr ? ` · ${timeStr}` : ''}`;
      const message = getMessages(userLocale).reminder(opponentStr, '', '', whenStr, location);
      const result = await whatsappService.sendInviteMessage(phone, message);

      if (result.success) {
        await prisma.reminder.update({
          where: { id: reminder.id },
          data: { status: 'sent', sentAt: new Date() },
        });
        //logger.info('ReminderSent', { reminderId: reminder.id, userId: reminder.userId });
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
