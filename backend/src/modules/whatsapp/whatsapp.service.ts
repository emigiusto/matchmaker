// whatsapp.service.ts
// WhatsApp integration service - abstracts providers (Whapi, WasenderApi, etc.)

import { logger } from '../../config/logger';
import type { IWhatsAppProvider } from './whatsapp.provider.interface';
import type { CreateGroupResult, WhatsAppProvider, WebhookIncomingMessage } from './whatsapp.types';
import { WhapiProvider } from './providers/whapi.provider';
import { WasenderProvider } from './providers/wasender.provider';
import { MockWhatsAppProvider } from './providers/mock.provider';

function normalizePhone(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  return digits.startsWith('0') ? digits.slice(1) : digits;
}

function toParticipantSet(participantPhones: string[], botPhone?: string): Set<string> {
  const all = [
    ...participantPhones.map(normalizePhone),
    ...(botPhone ? [normalizePhone(botPhone)] : []),
  ].filter(Boolean);
  return new Set(all);
}

function setsEqual(a: Set<string>, b: Set<string>): boolean {
  if (a.size !== b.size) return false;
  for (const x of a) if (!b.has(x)) return false;
  return true;
}

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

  async createMatchGroup(input: {
    participantPhones: string[];
    groupName: string;
    botPhone?: string;
  }): Promise<CreateGroupResult> {
    const expected = toParticipantSet(input.participantPhones, input.botPhone);
    if (expected.size < 2) return provider.createMatchGroup(input);

    const groups = await provider.listGroupsWithParticipants();
    const groupPhones = groups.map((g) => toParticipantSet(g.participantPhones, undefined));
    const idx = groupPhones.findIndex((s) => setsEqual(s, expected));
    if (idx >= 0) {
      const existing = groups[idx];
      const updateRes = await provider.updateGroupSubject(existing.groupId, input.groupName);
      if (!updateRes.success) return { success: false, error: updateRes.error };
      logger.info('WhatsappGroupReused', {
        groupId: existing.groupId,
        groupName: input.groupName,
        participants: input.participantPhones.length,
      });
      return { success: true, groupId: existing.groupId };
    }
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
