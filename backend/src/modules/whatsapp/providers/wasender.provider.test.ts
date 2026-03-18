import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import './__tests__/wasender.env';
import { WasenderProvider } from './wasender.provider';

describe('WasenderProvider', () => {
  let provider: WasenderProvider;
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    provider = new WasenderProvider();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe('sendInviteMessage', () => {
    it('sends message and returns success', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ success: true, data: { msgId: 123 } }),
      });

      const result = await provider.sendInviteMessage('34612345678', 'Hello');

      expect(result).toEqual({ success: true, messageId: '123' });
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('/api/send-message'),
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ to: '+34612345678', text: 'Hello' }),
        }),
      );
    });
  });

  describe('createMatchGroup', () => {
    it('creates group with JID participants and returns groupId', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            success: true,
            data: { id: '123456789@g.us' },
          }),
      });

      const result = await provider.createMatchGroup({
        participantPhones: ['34611111111', '34622222222'],
        groupName: 'Match Group',
        botPhone: '34600000000',
      });

      expect(result).toEqual({ success: true, groupId: '123456789@g.us' });
      const body = JSON.parse(fetchMock.mock.calls[0][1].body);
      expect(body.name).toBe('Match Group');
      expect(body.participants).toContain('34611111111@s.whatsapp.net');
      expect(body.participants).toContain('34622222222@s.whatsapp.net');
      expect(body.participants).toContain('34600000000@s.whatsapp.net');
    });
  });

  describe('listGroupsWithParticipants', () => {
    it('fetches groups and participants', async () => {
      fetchMock
        .mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve({
              data: [{ jid: '111@g.us' }, { jid: '222@g.us' }],
            }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve({
              data: [
                { id: '34611111111@s.whatsapp.net' },
                { id: '34622222222@s.whatsapp.net' },
              ],
            }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve({
              data: [{ id: '34633333333@lid' }],
            }),
        });

      const result = await provider.listGroupsWithParticipants();

      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({
        groupId: '111@g.us',
        participantPhones: ['34611111111', '34622222222'],
      });
      expect(result[1]).toEqual({
        groupId: '222@g.us',
        participantPhones: ['34633333333'],
      });
    });

    it('returns empty array when not configured', async () => {
      vi.resetModules();
      const prev = process.env.WASENDER_API_KEY;
      delete process.env.WASENDER_API_KEY;
      delete process.env.WASENDER_TOKEN;
      const { WasenderProvider: WP } = await import('./wasender.provider');
      const result = await new WP().listGroupsWithParticipants();
      expect(result).toEqual([]);
      process.env.WASENDER_API_KEY = prev;
    });
  });

  describe('updateGroupSubject', () => {
    it('updates group settings successfully', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ success: true }),
      });

      const result = await provider.updateGroupSubject('123@g.us', 'New Name');

      expect(result).toEqual({ success: true });
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('/api/groups/123%40g.us/settings'),
        expect.objectContaining({
          method: 'PUT',
          body: JSON.stringify({ subject: 'New Name' }),
        }),
      );
    });
  });

  describe('parseWebhookPayload', () => {
    it('parses Wasender messages-personal.received format', () => {
      const body = {
        event: 'messages-personal.received',
        data: {
          messages: {
            key: {
              fromMe: false,
              cleanedSenderPn: '34612345678',
              remoteJid: '34612345678@s.whatsapp.net',
            },
            messageBody: 'YES',
          },
        },
      };
      const result = provider.parseWebhookPayload(body);
      expect(result).toEqual({ senderPhone: '34612345678', messageText: 'YES' });
    });

    it('uses cleanedParticipantPn for group messages', () => {
      const body = {
        data: {
          messages: {
            key: {
              fromMe: false,
              cleanedParticipantPn: '34698765432',
            },
            messageBody: 'Hello',
          },
        },
      };
      const result = provider.parseWebhookPayload(body);
      expect(result).toEqual({ senderPhone: '34698765432', messageText: 'Hello' });
    });

    it('returns null for fromMe messages', () => {
      const body = {
        data: {
          messages: {
            key: { fromMe: true, cleanedSenderPn: '34612345678' },
            messageBody: 'my msg',
          },
        },
      };
      expect(provider.parseWebhookPayload(body)).toBeNull();
    });

    it('returns null when data.messages is missing', () => {
      expect(provider.parseWebhookPayload({})).toBeNull();
      expect(provider.parseWebhookPayload({ data: {} })).toBeNull();
    });

    it('extracts phone from remoteJid fallback', () => {
      const body = {
        data: {
          messages: {
            key: { fromMe: false, remoteJid: '34612345678@s.whatsapp.net' },
            messageBody: 'Hi',
          },
        },
      };
      const result = provider.parseWebhookPayload(body);
      expect(result).toEqual({ senderPhone: '34612345678', messageText: 'Hi' });
    });

    it('parses poll.results event (user voted NO)', () => {
      const body = {
        event: 'poll.results',
        data: {
          key: { remoteJid: '34600972125@s.whatsapp.net' },
          pollResult: [
            { name: 'YES', voters: [] },
            { name: 'NO', voters: ['34600972125@s.whatsapp.net'] },
          ],
        },
      };
      const result = provider.parseWebhookPayload(body);
      expect(result).toEqual({ senderPhone: '34600972125', messageText: 'NO', votedOptions: ['NO'] });
    });

    it('parses poll.results event (user voted YES)', () => {
      const body = {
        event: 'poll.results',
        data: {
          key: { remoteJid: '34611111111@s.whatsapp.net' },
          pollResult: [
            { name: 'YES', voters: ['34611111111@s.whatsapp.net'] },
            { name: 'NO', voters: [] },
          ],
        },
      };
      const result = provider.parseWebhookPayload(body);
      expect(result).toEqual({ senderPhone: '34611111111', messageText: 'YES', votedOptions: ['YES'] });
    });

    it('parses multi-select poll.results with multiple voted options', () => {
      const body = {
        event: 'poll.results',
        data: {
          key: { remoteJid: '34622222222@s.whatsapp.net' },
          pollResult: [
            { name: '10:00', voters: ['34622222222@s.whatsapp.net'] },
            { name: '11:00', voters: ['34622222222@s.whatsapp.net'] },
            { name: '12:00', voters: [] },
          ],
        },
      };
      const result = provider.parseWebhookPayload(body);
      expect(result).toEqual({
        senderPhone: '34622222222',
        messageText: '10:00',
        votedOptions: ['10:00', '11:00'],
      });
    });

    it('returns null when all poll options have empty voters', () => {
      const body = {
        event: 'poll.results',
        data: {
          key: { remoteJid: '34633333333@s.whatsapp.net' },
          pollResult: [
            { name: '10:00', voters: [] },
            { name: '11:00', voters: [] },
          ],
        },
      };
      const result = provider.parseWebhookPayload(body);
      expect(result).toBeNull();
    });

    it('includes all voted options even when voter phone differs from remoteJid', () => {
      const body = {
        event: 'poll.results',
        data: {
          key: { remoteJid: '34644444444@s.whatsapp.net' },
          pollResult: [
            { name: '09:00', voters: ['34644444444@s.whatsapp.net'] },
            { name: '10:00', voters: ['34644444444@s.whatsapp.net'] },
            { name: '11:00', voters: ['34644444444@s.whatsapp.net'] },
          ],
        },
      };
      const result = provider.parseWebhookPayload(body);
      expect(result?.votedOptions).toEqual(['09:00', '10:00', '11:00']);
      expect(result?.messageText).toBe('09:00');
    });
  });
});
