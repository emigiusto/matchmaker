// whatsapp.types.ts
// Types for WhatsApp integration (provider-agnostic)

export interface SendMessageResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

export interface CreateGroupResult {
  success: boolean;
  groupId?: string;
  error?: string;
}

/** Normalized webhook payload - same shape regardless of provider */
export interface WebhookIncomingMessage {
  senderPhone: string;
  messageText: string;
}

export type WhatsAppProvider = 'whapi' | 'wasender' | 'mock';
