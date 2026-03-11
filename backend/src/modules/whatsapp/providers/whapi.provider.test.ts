import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import './__tests__/whapi.env';
import { WhapiProvider } from './whapi.provider';

describe('WhapiProvider', () => {
  let provider: WhapiProvider;
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    provider = new WhapiProvider();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe('sendInviteMessage', () => {
    it('sends message and returns success', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ id: 'msg-123' }),
      });

      const result = await provider.sendInviteMessage('34612345678', 'Hello');

      expect(result).toEqual({ success: true, messageId: 'msg-123' });
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('/messages/text'),
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ to: '34612345678', body: 'Hello' }),
        }),
      );
    });

    it('returns error when not configured', async () => {
      vi.resetModules();
      const prevToken = process.env.WHAPI_TOKEN;
      const prevApiToken = process.env.WHAPI_API_TOKEN;
      delete process.env.WHAPI_TOKEN;
      delete process.env.WHAPI_API_TOKEN;
      const { WhapiProvider: WP } = await import('./whapi.provider');
      const p = new WP();
      const result = await p.sendInviteMessage('34612345678', 'Hi');
      expect(result).toEqual({ success: false, error: 'WHAPI_API_TOKEN not configured' });
      expect(fetchMock).not.toHaveBeenCalled();
      process.env.WHAPI_TOKEN = prevToken;
      process.env.WHAPI_API_TOKEN = prevApiToken;
    });

    it('returns error on API failure', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: false,
        statusText: 'Bad Request',
        json: () => Promise.resolve({ error: 'Invalid phone' }),
      });

      const result = await provider.sendInviteMessage('34612345678', 'Hi');
      expect(result).toEqual({ success: false, error: 'Invalid phone' });
    });

    it('sends interactive message with buttons when options.buttons provided', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ id: 'msg-interactive-1' }),
      });

      const result = await provider.sendInviteMessage('34612345678', 'Play with me?', {
        buttons: [
          { id: 'invite_yes', title: 'YES' },
          { id: 'invite_no', title: 'NO' },
        ],
      });

      expect(result).toEqual({ success: true, messageId: 'msg-interactive-1' });
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('/messages/interactive'),
        expect.objectContaining({
          method: 'POST',
          body: expect.stringContaining('quick_reply'),
        })
      );
      const body = JSON.parse(fetchMock.mock.calls[0][1].body);
      expect(body.type).toBe('button');
      expect(body.body.text).toBe('Play with me?');
      expect(body.action.buttons).toHaveLength(2);
      expect(body.action.buttons[0]).toEqual({ type: 'quick_reply', id: 'invite_yes', title: 'YES' });
    });
  });

  describe('createMatchGroup', () => {
    it('creates group and returns groupId', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ id: 'group-456' }),
      });

      const result = await provider.createMatchGroup({
        participantPhones: ['34611111111', '34622222222'],
        groupName: 'Match Group',
        botPhone: '34600000000',
      });

      expect(result).toEqual({ success: true, groupId: 'group-456' });
      const call = fetchMock.mock.calls[0];
      expect(call[0]).toContain('/groups');
      const body = JSON.parse(call[1].body);
      expect(body.subject).toBe('Match Group');
      expect(body.participants).toContain('34611111111');
      expect(body.participants).toContain('34622222222');
      expect(body.participants).toContain('34600000000');
    });
  });

  describe('listGroupsWithParticipants', () => {
    it('returns groups with participants', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            groups: [
              {
                id: 'g1',
                participants: [
                  { id: '34611111111', rank: 'admin' },
                  { id: '34622222222', rank: 'member' },
                ],
              },
            ],
          }),
      });

      const result = await provider.listGroupsWithParticipants();

      expect(result).toEqual([
        {
          groupId: 'g1',
          participantPhones: ['34611111111', '34622222222'],
        },
      ]);
    });

    it('returns empty array when not configured', async () => {
      vi.resetModules();
      const prevToken = process.env.WHAPI_TOKEN;
      delete process.env.WHAPI_TOKEN;
      delete process.env.WHAPI_API_TOKEN;
      const { WhapiProvider: WP } = await import('./whapi.provider');
      const result = await new WP().listGroupsWithParticipants();
      expect(result).toEqual([]);
      process.env.WHAPI_TOKEN = prevToken;
    });

    it('returns empty array on API error', async () => {
      fetchMock.mockResolvedValueOnce({ ok: false });
      const result = await provider.listGroupsWithParticipants();
      expect(result).toEqual([]);
    });
  });

  describe('updateGroupSubject', () => {
    it('updates group subject successfully', async () => {
      fetchMock.mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({}) });

      const result = await provider.updateGroupSubject('group-123', 'New Name');

      expect(result).toEqual({ success: true });
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('/groups/group-123'),
        expect.objectContaining({
          method: 'PUT',
          body: JSON.stringify({ subject: 'New Name' }),
        }),
      );
    });
  });

  describe('parseWebhookPayload', () => {
    it('parses Whapi messages format', () => {
      const body = {
        messages: [
          {
            from: '34612345678',
            type: 'text',
            from_me: false,
            text: { body: 'YES' },
          },
        ],
      };
      const result = provider.parseWebhookPayload(body);
      expect(result).toEqual({ senderPhone: '34612345678', messageText: 'YES' });
    });

    it('returns null for from_me messages', () => {
      const body = {
        messages: [
          {
            from: '34612345678',
            type: 'text',
            from_me: true,
            text: { body: 'my message' },
          },
        ],
      };
      expect(provider.parseWebhookPayload(body)).toBeNull();
    });

    it('returns null for non-text messages', () => {
      const body = {
        messages: [
          {
            from: '34612345678',
            type: 'image',
            from_me: false,
          },
        ],
      };
      expect(provider.parseWebhookPayload(body)).toBeNull();
    });

    it('returns null when messages is empty', () => {
      expect(provider.parseWebhookPayload({ messages: [] })).toBeNull();
    });

    it('returns null when messages is missing', () => {
      expect(provider.parseWebhookPayload({})).toBeNull();
    });

    it('normalizes phone digits', () => {
      const body = {
        messages: [
          {
            from: '+34 612 345 678',
            type: 'text',
            from_me: false,
            text: { body: 'Hi' },
          },
        ],
      };
      const result = provider.parseWebhookPayload(body);
      expect(result).toEqual({ senderPhone: '34612345678', messageText: 'Hi' });
    });

    it('parses quick-reply button response (type reply, buttons_reply)', () => {
      const body = {
        messages: [
          {
            from: '34612345678',
            type: 'reply',
            from_me: false,
            reply: {
              type: 'buttons_reply',
              buttons_reply: { id: 'invite_yes', title: 'YES' },
            },
          },
        ],
      };
      const result = provider.parseWebhookPayload(body);
      expect(result).toEqual({ senderPhone: '34612345678', messageText: 'YES' });
    });
  });
});
