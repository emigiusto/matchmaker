// conversations.service.ts
// Service layer for chat conversations (contextual to matches, users)
// Invariants:
// - One conversation per match (enforced in getOrCreateConversationForMatch)
// - No attachments, no read receipts (MVP scope)
// - No permissions beyond existence checks
// - No side effects (pure data ops)
// Chat is contextual: conversations are tied to matches, users, or groups.
//
// Future extension points:
// - Add support for group/direct conversations
// - Add permissions/roles for private chats
// - Add conversation metadata (topic, lastMessage, etc)
// - Add soft-delete/archiving

import { prisma } from '../../shared/prisma';
import { ConversationDTO } from './chat.types';
import { AppError } from '../../shared/errors/AppError';

/**
 * Get a conversation by ID.
 * Throws if not found.
 */
export async function getConversationById(id: string): Promise<ConversationDTO> {
  const conversation = await prisma.conversation.findUnique({ where: { id } });
  if (!conversation) throw new AppError('Conversation not found', 404);
  return toConversationDTO(conversation);
}


/**
 * Create a new conversation (direct, group, or match).
 * For match: only one conversation per match is allowed (idempotent).
 * For direct/group: always creates a new conversation.
 */
export async function createConversation(type: 'direct' | 'group' | 'match', matchId?: string): Promise<ConversationDTO> {
  if (type === 'match') {
    if (!matchId) throw new AppError('matchId required for match conversations', 400);
    // Check if match exists
    const match = await prisma.match.findUnique({ where: { id: matchId } });
    if (!match) throw new AppError('Match not found', 404);
    // Find or create conversation
    let conversation = await prisma.conversation.findUnique({ where: { matchId } });
    if (!conversation) {
      conversation = await prisma.conversation.create({
        data: { type, matchId },
      });
    }
    return toConversationDTO(conversation);
  } else {
    // direct/group: always create new
    const conversation = await prisma.conversation.create({
      data: { type },
    });
    return toConversationDTO(conversation);
  }
}

/**
 * Convert a Conversation to ConversationDTO
 */
function toConversationDTO(conversation: any): ConversationDTO {
  return {
    id: conversation.id,
    type: conversation.type,
    matchId: conversation.matchId,
    createdAt: conversation.createdAt.toISOString(),
  };
}
