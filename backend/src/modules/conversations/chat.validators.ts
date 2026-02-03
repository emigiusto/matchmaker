// chat.validators.ts
// Zod validators for chat MVP (conversations & messages)

import { z } from 'zod';

export const createMessageSchema = z.object({
  conversationId: z.string().uuid('Invalid conversationId'),
  senderUserId: z.string().uuid('Invalid senderUserId'),
  content: z.string().min(1, 'Message content is required'),
  // No attachments in MVP
});

export const conversationIdParamSchema = z.object({
  id: z.string().uuid('Invalid conversationId'),
});

export const messageIdParamSchema = z.object({
  id: z.string().uuid('Invalid messageId'),
});

// TODO: Add support for attachments, read receipts, editing, deleting in future
