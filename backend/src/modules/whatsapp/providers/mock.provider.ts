// mock.provider.ts
// Mock WhatsApp provider for development and testing - logs all actions instead of calling real API

import type { IWhatsAppProvider, CreateMatchGroupInput } from '../whatsapp.provider.interface';
import type { SendMessageResult, CreateGroupResult } from '../whatsapp.types';
import { logger } from '../../../config/logger';

export class MockWhatsAppProvider implements IWhatsAppProvider {
  async sendInviteMessage(phoneNumber: string, message: string): Promise<SendMessageResult> {
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

  async sendGroupMessage(groupId: string, message: string): Promise<SendMessageResult> {
    logger.info('[MOCK WhatsApp] sendGroupMessage', {
      groupId,
      messageLength: message.length,
      preview: message.slice(0, 80) + (message.length > 80 ? '...' : ''),
    });
    return { success: true, messageId: `mock-${Date.now()}` };
  }
}
