// messages.service.ts
// Service layer for chat messages (MVP: no attachments, no read receipts)
// Invariants:
// - No attachments, no read receipts (MVP scope)
// - No permissions beyond sender/conversation existence
// - No side effects (pure data ops)
// - Messages ordered by createdAt ASC
//
// Future extension points:
// - Add support for attachments (files, images)
// - Add read receipts, reactions, editing, deleting
// - Add message metadata (edited, deleted, etc)
// - Add permissions/roles for private/group chats

import { prisma } from '../../prisma';
import { MessageDTO } from '../conversations/chat.types';
import { AppError } from '../../shared/errors/AppError';

/**
 * Create a new message in a conversation.
 * MVP: no attachments, no read receipts.
 */
export async function createMessage(conversationId: string, senderUserId: string, content: string): Promise<MessageDTO> {
  // Validate conversation exists
  const conversation = await prisma.conversation.findUnique({ where: { id: conversationId } });
  if (!conversation) throw new AppError('Conversation not found', 404);
  // Validate sender exists
  const sender = await prisma.user.findUnique({ where: { id: senderUserId } });
  if (!sender) throw new AppError('Sender user not found', 404);
  // Create message
  const message = await prisma.message.create({
    data: {
      conversationId,
      senderUserId,
      content,
    },
  });
  return toMessageDTO(message);
}

/**
 * List all messages in a conversation, ordered by createdAt ASC.
 */
export async function listMessages(conversationId: string): Promise<MessageDTO[]> {
  // Validate conversation exists
  const conversation = await prisma.conversation.findUnique({ where: { id: conversationId } });
  if (!conversation) throw new AppError('Conversation not found', 404);
  const messages = await prisma.message.findMany({
    where: { conversationId },
    orderBy: { createdAt: 'asc' },
  });
  return messages.map(toMessageDTO);
}

/**
 * Convert a Message to MessageDTO
 */
function toMessageDTO(message: any): MessageDTO {
  return {
    id: message.id,
    conversationId: message.conversationId,
    senderUserId: message.senderUserId,
    content: message.content,
    createdAt: message.createdAt.toISOString(),
  };
}

// MVP: No attachments, no read receipts, minimal fields only.
