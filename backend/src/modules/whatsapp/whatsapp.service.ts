// whatsapp.service.ts
// WhatsApp integration service - abstracts providers (Whapi, WasenderApi, etc.)

import { logger } from '../../config/logger';
import type { IWhatsAppProvider, InviteMessageOptions } from './whatsapp.provider.interface';
import type { CreateGroupResult, GetGroupInviteLinkResult, WhatsAppProvider, WebhookIncomingMessage } from './whatsapp.types';
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

const MIN_SEND_INTERVAL_MS =
  Number(process.env.WHATSAPP_MIN_SEND_INTERVAL_MS || '5000') || 0;

let lastSendAt = 0;
let sendChain: Promise<unknown> = Promise.resolve();

async function delay(ms: number): Promise<void> {
  if (ms > 0) {
    await new Promise((resolve) => setTimeout(resolve, ms));
  }
}

function withRateLimit<T>(task: () => Promise<T>): Promise<T> {
  const run = async () => {
    if (MIN_SEND_INTERVAL_MS > 0) {
      const now = Date.now();
      const elapsed = now - lastSendAt;
      const wait = MIN_SEND_INTERVAL_MS - elapsed;
      if (wait > 0) {
        await delay(wait);
      }
    }
    const result = await task();
    lastSendAt = Date.now();
    return result;
  };

  const next = sendChain.then(run, run);
  sendChain = next.then(
    () => undefined,
    () => undefined
  );
  return next;
}

export const whatsappService = {
  async sendInviteMessage(phoneNumber: string, message: string, options?: InviteMessageOptions) {
    return withRateLimit(() => provider.sendInviteMessage(phoneNumber, message, options));
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

  async updateGroupSubject(groupId: string, subject: string) {
    return provider.updateGroupSubject(groupId, subject);
  },

  /**
   * Sends the group invite link to all expected participants via private message.
   * Excludes botPhone from the set.
   */
  async ensureParticipantsReceiveGroupInvite(
    groupId: string,
    participantPhones: string[],
    inviteMessage: string | ((phone: string) => string),
    botPhone?: string
  ): Promise<{ sentTo: string[]; errors: string[] }> {
    const expectedSet = new Set(
      participantPhones
        .map(normalizePhone)
        .filter(Boolean)
        .filter((p) => !botPhone || normalizePhone(botPhone) !== p)
    );
    if (expectedSet.size === 0) return { sentTo: [], errors: [] };

    const linkRes = await provider.getGroupInviteLink(groupId);
    if (!linkRes.success || !linkRes.inviteLink) {
      logger.warn('CouldNotGetGroupInviteLink', {
        groupId,
        error: linkRes.error,
      });
      return { sentTo: [], errors: [linkRes.error ?? 'No invite link'] };
    }

    const sentTo: string[] = [];
    const errors: string[] = [];

    for (const phone of expectedSet) {
      const base =
        typeof inviteMessage === 'function' ? inviteMessage(phone) : inviteMessage;
      const fullMessage = `${base}\n\n${linkRes.inviteLink}`;
      const res = await withRateLimit(() => provider.sendInviteMessage(phone, fullMessage));
      if (res.success) {
        sentTo.push(phone);
        logger.info('GroupInviteLinkSent', { groupId, phone });
      } else {
        errors.push(`${phone}: ${res.error ?? 'send failed'}`);
        logger.warn('GroupInviteLinkSendFailed', { groupId, phone, error: res.error });
      }
    }

    return { sentTo, errors };
  },

  /** Fetch the shareable invite link for a WhatsApp group. */
  async getGroupInviteLink(groupId: string): Promise<GetGroupInviteLinkResult> {
    return provider.getGroupInviteLink(groupId);
  },

  async sendReaction(phoneNumber: string, messageId: string, emoji: string) {
    return withRateLimit(() => provider.sendReaction(phoneNumber, messageId, emoji));
  },

  /** Parse provider-specific webhook body into normalized message. Returns null if not an incoming 1:1 text. */
  parseWebhookPayload(body: unknown): WebhookIncomingMessage | null {
    return provider.parseWebhookPayload(body);
  },
};
