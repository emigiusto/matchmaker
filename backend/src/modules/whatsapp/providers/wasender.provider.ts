// wasender.provider.ts
// WasenderApi WhatsApp API provider
// Docs: https://wasenderapi.com/api-docs

import type {
  IWhatsAppProvider,
  CreateMatchGroupInput,
  GroupWithParticipants,
  InviteMessageOptions,
} from '../whatsapp.provider.interface';
import type {
  SendMessageResult,
  CreateGroupResult,
  GetGroupInviteLinkResult,
  GetGroupParticipantsResult,
  WebhookIncomingMessage,
} from '../whatsapp.types';

const WASENDER_BASE =
  process.env.WASENDER_BASE_URL || process.env.WASENDER_API_URL || 'https://www.wasenderapi.com';
const WASENDER_TOKEN = process.env.WASENDER_API_KEY || process.env.WASENDER_TOKEN || '';

function normalizePhone(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  return digits.startsWith('0') ? digits.slice(1) : digits;
}

/** Convert phone to WhatsApp JID for groups API */
function phoneToJid(phone: string): string {
  const digits = normalizePhone(phone);
  return `${digits}@s.whatsapp.net`;
}

/** Ensure group ID is in JID format (xxx@g.us) */
function toGroupJid(groupId: string): string {
  const clean = String(groupId).trim();
  if (clean.endsWith('@g.us')) return clean;
  const digits = clean.replace(/\D/g, '');
  return digits ? `${digits}@g.us` : clean;
}

export class WasenderProvider implements IWhatsAppProvider {
  async sendInviteMessage(phoneNumber: string, message: string, options?: InviteMessageOptions): Promise<SendMessageResult> {
    if (!WASENDER_TOKEN) {
      return { success: false, error: 'WASENDER_API_KEY not configured' };
    }
    try {
      const to = `+${normalizePhone(phoneNumber)}`;
      const buttons = options?.buttons?.slice(0, 12);

      type WasenderResponse = {
        success?: boolean;
        data?: { msgId?: string };
        error?: string;
        message?: string;
        retry_after?: number;
      };

      const sendOnce = async (body: Record<string, unknown>): Promise<{ ok: boolean; res: Response; data: WasenderResponse }> => {
        const res = await fetch(`${WASENDER_BASE}/api/send-message`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${WASENDER_TOKEN}`,
          },
          body: JSON.stringify(body),
        });
        const data = (await res.json()) as WasenderResponse;
        return { ok: res.ok, res, data };
      };

      const sendWithRetry = async (body: Record<string, unknown>) => {
        let { ok, res, data } = await sendOnce(body);
        // Handle Wasender "Account Protection" rate limiting with a single retry.
        const retryAfter = typeof data?.retry_after === 'number' ? data.retry_after : 0;
        if (
          !ok &&
          retryAfter > 0 &&
          (data?.message || data?.error || '').includes('You have account protection enabled')
        ) {
          await new Promise((r) => setTimeout(r, retryAfter * 1000));
          ({ ok, res, data } = await sendOnce(body));
        }
        return { ok, res, data };
      };

      let pollBody: Record<string, unknown>;

      if (buttons && buttons.length >= 2) {
        if (message.length > 255) {
          // Message is too long to fit in a poll question — send it as plain text first
          // so the recipient has full context, then send the poll with a short question.
          await sendWithRetry({ to, text: message });
          // Use the last two paragraphs (the voting prompt + timer) as the short question.
          const paragraphs = message.split('\n\n');
          const shortQuestion = paragraphs.slice(-2).join('\n\n');
          pollBody = { to, poll: { question: shortQuestion, options: buttons.map((b) => b.title.slice(0, 25)), multiSelect: true } };
        } else {
          pollBody = { to, poll: { question: message, options: buttons.map((b) => b.title.slice(0, 25)), multiSelect: true } };
        }
      } else {
        pollBody = { to, text: message };
      }

      const { ok, res, data } = await sendWithRetry(pollBody);

      if (!ok) {
        const errMsg = data.error || data.message || res.statusText;
        const extra = typeof data === 'object' && data !== null ? JSON.stringify(data) : '';
        return { success: false, error: extra ? `${errMsg} (${extra})` : errMsg };
      }

      return {
        success: true,
        messageId: data.data?.msgId != null ? String(data.data.msgId) : undefined,
      };
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  async createMatchGroup(input: CreateMatchGroupInput): Promise<CreateGroupResult> {
    if (!WASENDER_TOKEN) {
      return { success: false, error: 'WASENDER_API_KEY not configured' };
    }
    try {
      const participants = [
        ...input.participantPhones.map(normalizePhone),
        ...(input.botPhone ? [normalizePhone(input.botPhone)] : []),
      ]
        .filter(Boolean)
        .filter((p, i, arr) => arr.indexOf(p) === i)
        .map(phoneToJid);

      const res = await fetch(`${WASENDER_BASE}/api/groups`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${WASENDER_TOKEN}`,
        },
        body: JSON.stringify({
          name: input.groupName,
          participants,
        }),
      });
      const data = (await res.json()) as {
        success?: boolean;
        data?: { id?: string };
        error?: string;
      };
      if (!res.ok) {
        return { success: false, error: data.error || res.statusText };
      }
      const groupId = data.data?.id;
      if (!groupId) {
        return { success: false, error: 'No group id in response' };
      }
      return { success: true, groupId };
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  async getGroupInviteLink(groupId: string): Promise<GetGroupInviteLinkResult> {
    if (!WASENDER_TOKEN) {
      return { success: false, error: 'WASENDER_API_KEY not configured' };
    }
    const tryFetch = async (): Promise<GetGroupInviteLinkResult> => {
      const jid = toGroupJid(groupId);
      const res = await fetch(`${WASENDER_BASE}/api/groups/${encodeURIComponent(jid)}/invite-link`, {
        method: 'GET',
        headers: { Authorization: `Bearer ${WASENDER_TOKEN}` },
      });
      const data = (await res.json()) as {
        success?: boolean;
        inviteLink?: string;
        data?: { inviteLink?: string };
        error?: string;
        message?: string;
      };
      if (!res.ok) {
        return { success: false, error: data.error || data.message || res.statusText };
      }
      const inviteLink = data.inviteLink ?? data.data?.inviteLink;
      if (!inviteLink) {
        const apiMsg = data.error || data.message;
        return {
          success: false,
          error: apiMsg ? `No invite link in response: ${apiMsg}` : 'No invite link in response',
        };
      }
      return { success: true, inviteLink };
    };

    try {
      let result = await tryFetch();
      if (!result.success && result.error?.includes('No invite link')) {
        await new Promise((r) => setTimeout(r, 1500));
        result = await tryFetch();
      }
      return result;
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  async getGroupParticipants(groupId: string): Promise<GetGroupParticipantsResult> {
    if (!WASENDER_TOKEN) {
      return { success: false, error: 'WASENDER_API_KEY not configured' };
    }
    try {
      const jid = toGroupJid(groupId);
      const res = await fetch(
        `${WASENDER_BASE}/api/groups/${encodeURIComponent(jid)}/participants`,
        { method: 'GET', headers: { Authorization: `Bearer ${WASENDER_TOKEN}` } },
      );
      const data = (await res.json()) as { success?: boolean; data?: Array<{ id?: string }>; error?: string };
      if (!res.ok) {
        return { success: false, error: data.error || res.statusText };
      }
      const participants = data.data ?? [];
      const phones = participants
        .map((p) => {
          if (!p.id) return '';
          const beforeAt = String(p.id).split('@')[0] ?? '';
          return beforeAt.replace(/\D/g, '');
        })
        .filter(Boolean);
      return { success: true, participantPhones: phones };
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  async listGroupsWithParticipants(): Promise<GroupWithParticipants[]> {
    if (!WASENDER_TOKEN) return [];
    try {
      const listRes = await fetch(`${WASENDER_BASE}/api/groups`, {
        method: 'GET',
        headers: { Authorization: `Bearer ${WASENDER_TOKEN}` },
      });
      if (!listRes.ok) return [];
      const listData = (await listRes.json()) as { data?: Array<{ jid?: string }> };
      const groups = listData.data ?? [];
      const result: GroupWithParticipants[] = [];

      for (const g of groups) {
        const jid = g.jid;
        if (!jid) continue;
        try {
          const partRes = await fetch(
            `${WASENDER_BASE}/api/groups/${encodeURIComponent(jid)}/participants`,
            { method: 'GET', headers: { Authorization: `Bearer ${WASENDER_TOKEN}` } },
          );
          if (!partRes.ok) continue;
          const partData = (await partRes.json()) as { data?: Array<{ id?: string }> };
          const participants = partData.data ?? [];
          const phones = participants
            .map((p) => {
              if (!p.id) return '';
              const beforeAt = String(p.id).split('@')[0] ?? '';
              return beforeAt.replace(/\D/g, '');
            })
            .filter(Boolean);
          result.push({ groupId: jid, participantPhones: phones });
        } catch {
          // Skip group on error
        }
      }
      return result;
    } catch {
      return [];
    }
  }

  async updateGroupSubject(groupId: string, subject: string): Promise<SendMessageResult> {
    if (!WASENDER_TOKEN) {
      return { success: false, error: 'WASENDER_API_KEY not configured' };
    }
    try {
      const res = await fetch(
        `${WASENDER_BASE}/api/groups/${encodeURIComponent(groupId)}/settings`,
        {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${WASENDER_TOKEN}`,
          },
          body: JSON.stringify({ subject }),
        },
      );
      const data = (await res.json()) as { success?: boolean; error?: string };
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
    if (!WASENDER_TOKEN) {
      return { success: false, error: 'WASENDER_API_KEY not configured' };
    }
    try {
      const res = await fetch(`${WASENDER_BASE}/api/send-message`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${WASENDER_TOKEN}`,
        },
        body: JSON.stringify({
          to: groupId,
          text: message,
        }),
      });
      const data = (await res.json()) as {
        success?: boolean;
        data?: { msgId?: string };
        error?: string;
      };
      if (!res.ok) {
        return { success: false, error: data.error || res.statusText };
      }
      return {
        success: true,
        messageId: data.data?.msgId != null ? String(data.data.msgId) : undefined,
      };
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  async sendReaction(_phoneNumber: string, _messageId: string, _emoji: string): Promise<SendMessageResult> {
    // Wasender API does not support sending reactions — reactions are receive-only via webhook.
    return { success: false, error: 'Reactions not supported by Wasender API' };
  }

  parseWebhookPayload(body: unknown): WebhookIncomingMessage | null {
    const b = body as Record<string, unknown>;
    const data = b?.data as Record<string, unknown> | undefined;

    if (b?.event === 'poll.results' && data?.pollResult && Array.isArray(data.pollResult)) {
      return this.parsePollResults(data as { key?: Record<string, unknown>; pollResult: Array<{ name?: string; voters?: string[] }> });
    }

    const messages = data?.messages;
    if (!messages || typeof messages !== 'object') return null;

    const msgObj = messages as Record<string, unknown>;
    const key = msgObj.key as Record<string, unknown> | undefined;
    if (!key) return null;
    if (key.fromMe) return null;

    const senderPhone =
      (key.cleanedSenderPn as string) ??
      (key.cleanedParticipantPn as string) ??
      (typeof key.remoteJid === 'string'
        ? String(key.remoteJid).replace(/@.*$/, '').replace(/\D/g, '')
        : '');
    const messageText = msgObj.messageBody as string | undefined;

    if (!senderPhone || messageText === undefined || messageText === '') return null;
    return {
      senderPhone: senderPhone.replace(/\D/g, ''),
      messageText: String(messageText),
    };
  }

  private parsePollResults(data: {
    key?: Record<string, unknown>;
    pollResult: Array<{ name?: string; voters?: string[] }>;
  }): WebhookIncomingMessage | null {
    const allVoted = data.pollResult.filter((r) => Array.isArray(r.voters) && r.voters.length > 0);
    if (allVoted.length === 0) return null;

    const primary = allVoted[0];
    const key = data.key;
    const remoteJid = key?.remoteJid && typeof key.remoteJid === 'string' ? String(key.remoteJid) : '';
    const voter0 = primary.voters?.[0] ? String(primary.voters[0]) : '';

    const extractPhone = (jid: string) => jid.replace(/@.*$/, '').replace(/\D/g, '');

    // For 1:1 chats: remoteJid = user we sent to (e.g. 4591616559@s.whatsapp.net)
    // Prefer remoteJid over voters — voters can contain LID format (e.g. 21:32:xxx@lid) that doesn't match our DB
    const fromRemote = extractPhone(remoteJid);
    const fromVoter = extractPhone(voter0);

    const is1to1 = remoteJid.endsWith('@s.whatsapp.net') && !remoteJid.includes('@g.us');
    const senderPhone = is1to1 && fromRemote ? fromRemote : fromVoter || fromRemote;
    if (!senderPhone) return null;

    const votedOptions = allVoted.map((r) => String(r.name).trim());
    return {
      senderPhone,
      messageText: votedOptions[0].toUpperCase(),
      votedOptions,
    };
  }
}
