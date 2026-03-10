// mock.provider.ts
// Mock WhatsApp provider for development and testing

import type { IWhatsAppProvider, CreateMatchGroupInput } from '../whatsapp.provider.interface';
import type { SendMessageResult, CreateGroupResult } from '../whatsapp.types';

export class MockWhatsAppProvider implements IWhatsAppProvider {
  async sendInviteMessage(phoneNumber: string, message: string): Promise<SendMessageResult> {
    // eslint-disable-next-line no-console
    console.log('[MOCK WhatsApp] sendInviteMessage', { phoneNumber, messagePreview: message.slice(0, 50) + '...' });
    return { success: true, messageId: `mock-${Date.now()}` };
  }

  async createMatchGroup(input: CreateMatchGroupInput): Promise<CreateGroupResult> {
    // eslint-disable-next-line no-console
    console.log('[MOCK WhatsApp] createMatchGroup', { groupName: input.groupName, participantPhones: input.participantPhones, botPhone: input.botPhone });
    return { success: true, groupId: `mock-group-${Date.now()}` };
  }

  async sendGroupMessage(groupId: string, message: string): Promise<SendMessageResult> {
    // eslint-disable-next-line no-console
    console.log('[MOCK WhatsApp] sendGroupMessage', { groupId, messagePreview: message.slice(0, 50) + '...' });
    return { success: true, messageId: `mock-${Date.now()}` };
  }
}
