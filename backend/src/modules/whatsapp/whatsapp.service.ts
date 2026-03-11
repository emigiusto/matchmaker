// whatsapp.service.ts
// WhatsApp integration service - abstracts providers (Whapi, WasenderApi, etc.)

import type { IWhatsAppProvider } from './whatsapp.provider.interface';
import type { WhatsAppProvider, WebhookIncomingMessage } from './whatsapp.types';
import { WhapiProvider } from './providers/whapi.provider';
import { WasenderProvider } from './providers/wasender.provider';
import { MockWhatsAppProvider } from './providers/mock.provider';

function getProvider(): IWhatsAppProvider {
  const providerName = (process.env.WHATSAPP_PROVIDER || 'mock') as WhatsAppProvider;
  switch (providerName) {
    case 'whapi':
      return new WhapiProvider();
    case 'wasender':
      return new WasenderProvider();
    case 'mock':
    default:
      return new MockWhatsAppProvider();
  }
}

const provider = getProvider();

export const whatsappService = {
  async sendInviteMessage(phoneNumber: string, message: string) {
    return provider.sendInviteMessage(phoneNumber, message);
  },

  async createMatchGroup(input: { participantPhones: string[]; groupName: string; botPhone?: string }) {
    return provider.createMatchGroup(input);
  },

  async sendGroupMessage(groupId: string, message: string) {
    return provider.sendGroupMessage(groupId, message);
  },

  /** Parse provider-specific webhook body into normalized message. Returns null if not an incoming 1:1 text. */
  parseWebhookPayload(body: unknown): WebhookIncomingMessage | null {
    return provider.parseWebhookPayload(body);
  },
};
