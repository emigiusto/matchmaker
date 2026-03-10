// whatsapp.types.ts
// Types for WhatsApp integration

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

export type WhatsAppProvider = 'whapi' | 'wasender' | 'mock';
