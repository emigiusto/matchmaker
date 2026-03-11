// whatsapp.provider.interface.ts
// Abstract interface for WhatsApp providers (Whapi, WasenderApi, etc.)

import type {
  SendMessageResult,
  CreateGroupResult,
  WebhookIncomingMessage,
} from './whatsapp.types';

export interface CreateMatchGroupInput {
  /** All player phones (host, hostPartner for doubles, opponent, opponentPartner for doubles) */
  participantPhones: string[];
  groupName: string;
  botPhone?: string;
}

export interface IWhatsAppProvider {
  sendInviteMessage(phoneNumber: string, message: string): Promise<SendMessageResult>;
  createMatchGroup(input: CreateMatchGroupInput): Promise<CreateGroupResult>;
  sendGroupMessage(groupId: string, message: string): Promise<SendMessageResult>;

  /**
   * Parse provider-specific webhook body into normalized incoming message.
   * Returns null if the payload is not an incoming 1:1 text message we care about.
   */
  parseWebhookPayload(body: unknown): WebhookIncomingMessage | null;
}
