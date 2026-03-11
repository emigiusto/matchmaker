// whapi.provider.ts
// Whapi.Cloud WhatsApp API provider
// Docs: https://whapi.cloud/docs

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

const WHAPI_BASE = process.env.WHAPI_BASE_URL || process.env.WHAPI_URL || 'https://gate.whapi.cloud';
const WHAPI_TOKEN = process.env.WHAPI_API_TOKEN || process.env.WHAPI_TOKEN || '';

function normalizePhone(phone: string): string {
  // Remove non-digits, ensure international format
  const digits = phone.replace(/\D/g, '');
  return digits.startsWith('0') ? digits.slice(1) : digits;
}

export class WhapiProvider implements IWhatsAppProvider {
  async sendInviteMessage(phoneNumber: string, message: string, options?: InviteMessageOptions): Promise<SendMessageResult> {
    if (!WHAPI_TOKEN) {
      return { success: false, error: 'WHAPI_API_TOKEN not configured' };
    }
    try {
      const to = normalizePhone(phoneNumber);
      const buttons = options?.buttons?.slice(0, 3);
      if (buttons && buttons.length >= 1) {
        const res = await fetch(`${WHAPI_BASE}/messages/interactive`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${WHAPI_TOKEN}`,
          },
          body: JSON.stringify({
            to,
            type: 'button',
            body: { text: message },
            action: {
              buttons: buttons.map((b) => ({
                type: 'quick_reply',
                id: b.id,
                title: b.title.slice(0, 25),
              })),
            },
          }),
        });
        const data = (await res.json()) as { id?: string; error?: string };
        if (!res.ok) {
          return { success: false, error: data.error || res.statusText };
        }
        return { success: true, messageId: data.id };
      }
      const res = await fetch(`${WHAPI_BASE}/messages/text`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${WHAPI_TOKEN}`,
        },
        body: JSON.stringify({ to, body: message }),
      });
      const data = (await res.json()) as { id?: string; error?: string };
      if (!res.ok) {
        return { success: false, error: data.error || res.statusText };
      }
      return { success: true, messageId: data.id };
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  async createMatchGroup(input: CreateMatchGroupInput): Promise<CreateGroupResult> {
    if (!WHAPI_TOKEN) {
      return { success: false, error: 'WHAPI_API_TOKEN not configured' };
    }
    try {
      const normalized = input.participantPhones
        .map((p) => normalizePhone(p))
        .filter(Boolean)
        .filter((p, i, arr) => arr.indexOf(p) === i);
      const participants = [
        ...normalized,
        ...(input.botPhone ? [normalizePhone(input.botPhone)] : []),
      ].filter(Boolean);
      const res = await fetch(`${WHAPI_BASE}/groups`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${WHAPI_TOKEN}`,
        },
        body: JSON.stringify({
          subject: input.groupName,
          participants,
        }),
      });
      const data = (await res.json()) as { id?: string; group_id?: string; error?: string };
      if (!res.ok) {
        return { success: false, error: data.error || res.statusText };
      }
      const groupId = data.id || data.group_id;
      return { success: true, groupId };
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  async listGroupsWithParticipants(): Promise<GroupWithParticipants[]> {
    if (!WHAPI_TOKEN) return [];
    try {
      const res = await fetch(`${WHAPI_BASE}/groups`, {
        method: 'GET',
        headers: { Authorization: `Bearer ${WHAPI_TOKEN}` },
      });
      if (!res.ok) return [];
      const data = (await res.json()) as { groups?: Array<{ id?: string; participants?: Array<{ id?: string }> }> };
      const groups = data.groups ?? [];
      return groups
        .filter((g) => g.id)
        .map((g) => ({
          groupId: g.id!,
          participantPhones: (g.participants ?? [])
            .map((p) => (p.id ? normalizePhone(p.id) : ''))
            .filter(Boolean),
        }));
    } catch {
      return [];
    }
  }

  async updateGroupSubject(groupId: string, subject: string): Promise<SendMessageResult> {
    if (!WHAPI_TOKEN) {
      return { success: false, error: 'WHAPI_API_TOKEN not configured' };
    }
    try {
      const res = await fetch(`${WHAPI_BASE}/groups/${groupId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${WHAPI_TOKEN}`,
        },
        body: JSON.stringify({ subject }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        return { success: false, error: data.error || res.statusText };
      }
      return { success: true };
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  async sendGroupMessage(groupId: string, message: string): Promise<SendMessageResult> {
    if (!WHAPI_TOKEN) {
      return { success: false, error: 'WHAPI_API_TOKEN not configured' };
    }
    try {
      const res = await fetch(`${WHAPI_BASE}/messages/text`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${WHAPI_TOKEN}`,
        },
        body: JSON.stringify({ to: groupId, body: message }),
      });
      const data = (await res.json()) as { id?: string; error?: string };
      if (!res.ok) {
        return { success: false, error: data.error || res.statusText };
      }
      return { success: true, messageId: data.id };
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  parseWebhookPayload(body: unknown): WebhookIncomingMessage | null {
    const b = body as Record<string, unknown>;
    const msg = Array.isArray(b?.messages) ? (b.messages as unknown[])[0] : null;
    const msgObj = msg && typeof msg === 'object' ? (msg as Record<string, unknown>) : null;
    if (!msgObj || msgObj.from_me) return null;
    const from = msgObj.from ? String(msgObj.from).replace(/\D/g, '') : '';

    if (msgObj.type === 'text') {
      const text = (msgObj.text as { body?: string })?.body;
      if (!from || text === undefined) return null;
      return { senderPhone: from, messageText: text };
    }
    if (msgObj.type === 'reply') {
      const reply = msgObj.reply as { type?: string; buttons_reply?: { id?: string; title?: string } } | undefined;
      if (reply?.type === 'buttons_reply' && reply.buttons_reply?.title) {
        if (!from) return null;
        return { senderPhone: from, messageText: reply.buttons_reply.title };
      }
    }
    return null;
  }
}
