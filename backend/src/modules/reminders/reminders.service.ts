// reminders.service.ts
// Create and manage match reminders. Job processes pending reminders and sends WhatsApp.

import { AppError } from '../../shared/errors/AppError';
import { prisma } from '../../prisma';

export interface CreateReminderInput {
  userId: string;
  matchId: string;
  scheduledAt: string; // ISO datetime when to send
}

export async function createReminder(input: CreateReminderInput) {
  const { userId, matchId, scheduledAt } = input;

  const scheduled = new Date(scheduledAt);
  if (isNaN(scheduled.getTime())) {
    throw new AppError('Invalid scheduledAt date', 400);
  }
  if (scheduled <= new Date()) {
    throw new AppError('scheduledAt must be in the future', 400);
  }

  const match = await prisma.match.findUnique({
    where: { id: matchId },
    include: {
      participants: true,
      invite: true,
      availability: { select: { userId: true } },
    },
  });

  if (!match) throw new AppError('Match not found', 404);
  const sendableStatuses = ['scheduled', 'awaiting_confirmation'];
  if (!sendableStatuses.includes(match.status)) {
    throw new AppError(
      match.status === 'cancelled'
        ? 'Cannot set reminder for cancelled match'
        : 'Reminders are only available for scheduled matches',
      400
    );
  }

  const isParticipant = match.participants.some((p) => p.userId === userId);
  const isInviter = match.invite ? match.invite.inviterUserId === userId : false;
  const isAvailabilityOwner = match.availability?.userId === userId;

  if (!isParticipant && !isInviter && !isAvailabilityOwner) {
    throw new AppError('You are not a participant in this match', 403);
  }

  const reminder = await prisma.reminder.create({
    data: {
      userId,
      matchId,
      scheduledAt: scheduled,
      status: 'pending',
    },
  });

  return reminder;
}

export async function listRemindersByUser(userId: string) {
  return prisma.reminder.findMany({
    where: { userId },
    include: { match: { include: { availability: true } } },
    orderBy: { scheduledAt: 'asc' },
  });
}

/**
 * Delete a reminder. Only pending reminders can be deleted.
 */
export async function deleteReminder(reminderId: string, userId: string): Promise<void> {
  const reminder = await prisma.reminder.findUnique({
    where: { id: reminderId },
  });
  if (!reminder) throw new AppError('Reminder not found', 404);
  if (reminder.userId !== userId) {
    throw new AppError('You can only delete your own reminders', 403);
  }
  if (reminder.status !== 'pending') {
    throw new AppError('Only pending reminders can be deleted', 400);
  }
  await prisma.reminder.delete({
    where: { id: reminderId },
  });
}
