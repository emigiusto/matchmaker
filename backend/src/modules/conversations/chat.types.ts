// chat.types.ts
// Types for chat MVP (conversations & messages)

/**
 * ConversationDTO: API-facing conversation object
 * MVP: minimal fields, no attachments/read receipts.
 */
export interface ConversationDTO {
  id: string;
  type: 'direct' | 'group' | 'match';
  matchId?: string | null;
  createdAt: string;
}

/**
 * MessageDTO: API-facing message object
 * MVP: minimal fields, no attachments/read receipts.
 */
export interface MessageDTO {
  id: string;
  conversationId: string;
  senderUserId: string;
  content: string;
  createdAt: string;
}

/**
 * Input for creating a new message
 */
export interface CreateMessageInput {
  conversationId: string;
  senderUserId: string;
  content: string;
}
