import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MockWhatsAppProvider } from './mock.provider';

vi.mock('../../../config/logger', () => ({
  logger: { info: vi.fn() },
}));

describe('MockWhatsAppProvider', () => {
  let provider: MockWhatsAppProvider;

  beforeEach(() => {
    provider = new MockWhatsAppProvider();
  });

  describe('sendInviteMessage', () => {
    it('returns success with mock messageId', async () => {
      const result = await provider.sendInviteMessage('34612345678', 'Hello');
      expect(result).toEqual({ success: true, messageId: expect.stringMatching(/^mock-\d+$/) });
    });
  });

  describe('createMatchGroup', () => {
    it('returns success with mock groupId', async () => {
      const result = await provider.createMatchGroup({
        participantPhones: ['34611111111', '34622222222'],
        groupName: 'Test Group',
        botPhone: '34600000000',
      });
      expect(result).toEqual({ success: true, groupId: expect.stringMatching(/^mock-group-\d+$/) });
    });
  });

  describe('listGroupsWithParticipants', () => {
    it('returns empty array', async () => {
      const result = await provider.listGroupsWithParticipants();
      expect(result).toEqual([]);
    });
  });

  describe('updateGroupSubject', () => {
    it('returns success', async () => {
      const result = await provider.updateGroupSubject('group-123', 'New Name');
      expect(result).toEqual({ success: true });
    });
  });

  describe('sendGroupMessage', () => {
    it('returns success with mock messageId', async () => {
      const result = await provider.sendGroupMessage('group-123', 'Hello group');
      expect(result).toEqual({ success: true, messageId: expect.stringMatching(/^mock-\d+$/) });
    });
  });

  describe('parseWebhookPayload', () => {
    it('parses flat format with sender.phone', () => {
      const body = {
        sender: { phone: '34612345678' },
        message: 'YES',
      };
      const result = provider.parseWebhookPayload(body);
      expect(result).toEqual({ senderPhone: '34612345678', messageText: 'YES' });
    });

    it('parses flat format with body.text', () => {
      const body = {
        from: '34612345678',
        body: { text: 'Hello' },
      };
      const result = provider.parseWebhookPayload(body);
      expect(result).toEqual({ senderPhone: '34612345678', messageText: 'Hello' });
    });

    it('parses flat format with text.body', () => {
      const body = {
        from: '+34612345678',
        text: { body: 'NO' },
      };
      const result = provider.parseWebhookPayload(body);
      expect(result).toEqual({ senderPhone: '34612345678', messageText: 'NO' });
    });

    it('parses contacts[0].wa_id', () => {
      const body = {
        contacts: [{ wa_id: '34612345678' }],
        message: 'OK',
      };
      const result = provider.parseWebhookPayload(body);
      expect(result).toEqual({ senderPhone: '34612345678', messageText: 'OK' });
    });

    it('returns null when sender is missing', () => {
      const body = { message: 'Hello' };
      expect(provider.parseWebhookPayload(body)).toBeNull();
    });

    it('returns null when messageText is missing', () => {
      const body = { from: '34612345678' };
      expect(provider.parseWebhookPayload(body)).toBeNull();
    });

    it('returns null for empty body', () => {
      expect(provider.parseWebhookPayload({})).toBeNull();
    });

    it('normalizes phone by stripping non-digits', () => {
      const body = { from: '+34 612 34 56 78', message: 'Hi' };
      const result = provider.parseWebhookPayload(body);
      expect(result).toEqual({ senderPhone: '34612345678', messageText: 'Hi' });
    });
  });
});
