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
  /** True when an existing group was reused (renamed) rather than a new one created. */
  reused?: boolean;
}

export interface GetGroupInviteLinkResult {
  success: boolean;
  inviteLink?: string;
  error?: string;
}

export interface GetGroupParticipantsResult {
  success: boolean;
  participantPhones?: string[];
  error?: string;
}

/** Normalized webhook payload - same shape regardless of provider */
export interface WebhookIncomingMessage {
  senderPhone: string;
  messageText: string;
  /** All currently-voted option titles for multi-select poll responses. */
  votedOptions?: string[];
}

export type WhatsAppProvider = 'whapi' | 'wasender' | 'mock';
