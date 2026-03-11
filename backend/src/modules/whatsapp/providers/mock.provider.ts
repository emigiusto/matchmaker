// mock.provider.ts
// Mock WhatsApp provider for development and testing - logs all actions instead of calling real API

import type {
  IWhatsAppProvider,
  CreateMatchGroupInput,
  GroupWithParticipants,
  InviteMessageOptions,
} from '../whatsapp.provider.interface';
import type {
  SendMessageResult,
  CreateGroupResult,
  WebhookIncomingMessage,
} from '../whatsapp.types';
import { logger } from '../../../config/logger';

export class MockWhatsAppProvider implements IWhatsAppProvider {
  async sendInviteMessage(phoneNumber: string, message: string, _options?: InviteMessageOptions): Promise<SendMessageResult> {
    logger.info('[MOCK WhatsApp] sendInviteMessage', {
      to: phoneNumber,
      messageLength: message.length,
      preview: message.slice(0, 80) + (message.length > 80 ? '...' : ''),
    });
    return { success: true, messageId: `mock-${Date.now()}` };
  }

  async createMatchGroup(input: CreateMatchGroupInput): Promise<CreateGroupResult> {
    logger.info('[MOCK WhatsApp] createMatchGroup', {
      groupName: input.groupName,
      participants: input.participantPhones.length,
      phones: input.participantPhones,
      botPhone: input.botPhone,
    });
    return { success: true, groupId: `mock-group-${Date.now()}` };
  }

  async listGroupsWithParticipants(): Promise<GroupWithParticipants[]> {
    return [];
  }

  async updateGroupSubject(groupId: string, subject: string): Promise<SendMessageResult> {
    logger.info('[MOCK WhatsApp] updateGroupSubject', { groupId, subject });
    return { success: true };
  }

  async sendGroupMessage(groupId: string, message: string): Promise<SendMessageResult> {
    logger.info('[MOCK WhatsApp] sendGroupMessage', {
      groupId,
      messageLength: message.length,
      preview: message.slice(0, 80) + (message.length > 80 ? '...' : ''),
    });
    return { success: true, messageId: `mock-${Date.now()}` };
  }

  parseWebhookPayload(body: unknown): WebhookIncomingMessage | null {
    const b = body as Record<string, unknown>;
    let senderPhone: string | undefined;
    let messageText: string | undefined;
    if (b?.sender && typeof b.sender === 'object') {
      senderPhone = (b.sender as { phone?: string }).phone;
    }
    if (!senderPhone && b?.from) senderPhone = String(b.from).replace(/\D/g, '');
    if (!senderPhone && Array.isArray(b?.contacts) && b.contacts.length > 0) {
      const c0 = b.contacts[0] as { wa_id?: string };
      senderPhone = c0?.wa_id;
    }
    if (messageText === undefined && b?.body && typeof b.body === 'object') {
      messageText = (b.body as { text?: string }).text;
    }
    if (messageText === undefined && b?.text && typeof b.text === 'object') {
      messageText = (b.text as { body?: string }).body;
    }
    if (messageText === undefined && typeof b?.message === 'string') messageText = b.message;
    if (!senderPhone || messageText === undefined) return null;
    return { senderPhone, messageText };
  }
}
