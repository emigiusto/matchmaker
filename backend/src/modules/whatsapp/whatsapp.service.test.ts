import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockProvider = vi.hoisted(() => ({
  sendInviteMessage: vi.fn(),
  createMatchGroup: vi.fn(),
  sendGroupMessage: vi.fn(),
  listGroupsWithParticipants: vi.fn(),
  updateGroupSubject: vi.fn(),
  parseWebhookPayload: vi.fn(),
}));

vi.mock('./providers/whapi.provider', () => ({
  WhapiProvider: function () {
    return mockProvider;
  },
}));
vi.mock('./providers/wasender.provider', () => ({
  WasenderProvider: function () {
    return mockProvider;
  },
}));
vi.mock('./providers/mock.provider', () => ({
  MockWhatsAppProvider: function () {
    return mockProvider;
  },
}));
vi.mock('../../config/logger', () => ({ logger: { info: vi.fn(), warn: vi.fn() } }));

describe('whatsappService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.WHATSAPP_PROVIDER = 'mock';
  });

  it('createMatchGroup creates new group when no matching group exists', async () => {
    vi.resetModules();
    const { whatsappService } = await import('./whatsapp.service');

    mockProvider.listGroupsWithParticipants.mockResolvedValue([]);
    mockProvider.createMatchGroup.mockResolvedValue({
      success: true,
      groupId: 'new-group-123',
    });

    const result = await whatsappService.createMatchGroup({
      participantPhones: ['34611111111', '34622222222'],
      groupName: 'Monday 10:00 - Central Park',
      botPhone: '34600000000',
    });

    expect(result).toEqual({ success: true, groupId: 'new-group-123' });
    expect(mockProvider.listGroupsWithParticipants).toHaveBeenCalledTimes(1);
    expect(mockProvider.updateGroupSubject).not.toHaveBeenCalled();
    expect(mockProvider.createMatchGroup).toHaveBeenCalledWith({
      participantPhones: ['34611111111', '34622222222'],
      groupName: 'Monday 10:00 - Central Park',
      botPhone: '34600000000',
    });
  });

  it('createMatchGroup reuses and renames existing group when participants match', async () => {
    vi.resetModules();
    const { whatsappService } = await import('./whatsapp.service');

    mockProvider.listGroupsWithParticipants.mockResolvedValue([
      {
        groupId: 'existing-group-456',
        participantPhones: ['34611111111', '34622222222', '34600000000'],
      },
    ]);
    mockProvider.updateGroupSubject.mockResolvedValue({ success: true });

    const result = await whatsappService.createMatchGroup({
      participantPhones: ['34611111111', '34622222222'],
      groupName: 'Tuesday 14:00 - New Location',
      botPhone: '34600000000',
    });

    expect(result).toEqual({ success: true, groupId: 'existing-group-456', reused: true });
    expect(mockProvider.listGroupsWithParticipants).toHaveBeenCalledTimes(1);
    expect(mockProvider.updateGroupSubject).toHaveBeenCalledWith(
      'existing-group-456',
      'Tuesday 14:00 - New Location',
    );
    expect(mockProvider.createMatchGroup).not.toHaveBeenCalled();
  });

  it('createMatchGroup matches participants regardless of order', async () => {
    vi.resetModules();
    const { whatsappService } = await import('./whatsapp.service');

    mockProvider.listGroupsWithParticipants.mockResolvedValue([
      {
        groupId: 'group-789',
        participantPhones: ['34622222222', '34611111111', '34600000000'],
      },
    ]);
    mockProvider.updateGroupSubject.mockResolvedValue({ success: true });

    const result = await whatsappService.createMatchGroup({
      participantPhones: ['34611111111', '34622222222'],
      groupName: 'Renamed',
      botPhone: '34600000000',
    });

    expect(result).toEqual({ success: true, groupId: 'group-789', reused: true });
    expect(mockProvider.updateGroupSubject).toHaveBeenCalled();
    expect(mockProvider.createMatchGroup).not.toHaveBeenCalled();
  });

  it('createMatchGroup creates new group when updateGroupSubject fails', async () => {
    vi.resetModules();
    const { whatsappService } = await import('./whatsapp.service');

    mockProvider.listGroupsWithParticipants.mockResolvedValue([
      {
        groupId: 'existing-999',
        participantPhones: ['34611111111', '34622222222', '34600000000'],
      },
    ]);
    mockProvider.updateGroupSubject.mockResolvedValue({
      success: false,
      error: 'Not admin',
    });
    mockProvider.createMatchGroup.mockResolvedValue({
      success: true,
      groupId: 'fallback-new',
    });

    const result = await whatsappService.createMatchGroup({
      participantPhones: ['34611111111', '34622222222'],
      groupName: 'Test',
      botPhone: '34600000000',
    });

    expect(result).toEqual({ success: false, error: 'Not admin' });
    expect(mockProvider.createMatchGroup).not.toHaveBeenCalled();
  });

  it('createMatchGroup delegates to provider when fewer than 2 participants', async () => {
    vi.resetModules();
    const { whatsappService } = await import('./whatsapp.service');

    mockProvider.createMatchGroup.mockResolvedValue({
      success: false,
      error: 'Need at least 2 participants',
    });

    const result = await whatsappService.createMatchGroup({
      participantPhones: ['34611111111'],
      groupName: 'Solo',
      botPhone: undefined,
    });

    expect(result).toEqual({ success: false, error: 'Need at least 2 participants' });
    expect(mockProvider.listGroupsWithParticipants).not.toHaveBeenCalled();
    expect(mockProvider.createMatchGroup).toHaveBeenCalledTimes(1);
  });

  it('createMatchGroup uses existingGroupId fast path: renames group without listing', async () => {
    vi.resetModules();
    const { whatsappService } = await import('./whatsapp.service');

    mockProvider.updateGroupSubject.mockResolvedValue({ success: true });

    const result = await whatsappService.createMatchGroup({
      participantPhones: ['34611111111', '34622222222'],
      groupName: 'Wednesday 18:00 · Alice · Bob',
      botPhone: '34600000000',
      existingGroupId: 'db-known-group-abc',
    });

    expect(result).toEqual({ success: true, groupId: 'db-known-group-abc', reused: true });
    expect(mockProvider.updateGroupSubject).toHaveBeenCalledWith('db-known-group-abc', 'Wednesday 18:00 · Alice · Bob');
    expect(mockProvider.listGroupsWithParticipants).not.toHaveBeenCalled();
    expect(mockProvider.createMatchGroup).not.toHaveBeenCalled();
  });

  it('createMatchGroup falls back to API listing when existingGroupId rename fails (group deleted)', async () => {
    vi.resetModules();
    const { whatsappService } = await import('./whatsapp.service');

    // Fast-path rename fails (group was deleted from WhatsApp)
    mockProvider.updateGroupSubject.mockResolvedValue({ success: false, error: 'Group not found' });
    // API listing finds no matching group either → creates new one
    mockProvider.listGroupsWithParticipants.mockResolvedValue([]);
    mockProvider.createMatchGroup.mockResolvedValue({ success: true, groupId: 'brand-new-group' });

    const result = await whatsappService.createMatchGroup({
      participantPhones: ['34611111111', '34622222222'],
      groupName: 'Thursday 09:00 · Alice · Bob',
      botPhone: '34600000000',
      existingGroupId: 'stale-group-xyz',
    });

    expect(result).toEqual({ success: true, groupId: 'brand-new-group' });
    expect(mockProvider.listGroupsWithParticipants).toHaveBeenCalledTimes(1);
    expect(mockProvider.createMatchGroup).toHaveBeenCalledTimes(1);
  });

  it('createMatchGroup falls back to API listing when existingGroupId rename fails and finds API match', async () => {
    vi.resetModules();
    const { whatsappService } = await import('./whatsapp.service');

    // First updateGroupSubject call: fast-path rename fails
    // Second updateGroupSubject call: API-path rename succeeds
    mockProvider.updateGroupSubject
      .mockResolvedValueOnce({ success: false, error: 'Group not found' })
      .mockResolvedValueOnce({ success: true });
    mockProvider.listGroupsWithParticipants.mockResolvedValue([
      {
        groupId: 'api-found-group',
        participantPhones: ['34611111111', '34622222222', '34600000000'],
      },
    ]);

    const result = await whatsappService.createMatchGroup({
      participantPhones: ['34611111111', '34622222222'],
      groupName: 'Friday 20:00 · Alice · Bob',
      botPhone: '34600000000',
      existingGroupId: 'stale-group-xyz',
    });

    expect(result).toEqual({ success: true, groupId: 'api-found-group', reused: true });
    expect(mockProvider.updateGroupSubject).toHaveBeenCalledTimes(2);
    expect(mockProvider.updateGroupSubject).toHaveBeenNthCalledWith(1, 'stale-group-xyz', 'Friday 20:00 · Alice · Bob');
    expect(mockProvider.updateGroupSubject).toHaveBeenNthCalledWith(2, 'api-found-group', 'Friday 20:00 · Alice · Bob');
    expect(mockProvider.createMatchGroup).not.toHaveBeenCalled();
  });

  it('parseWebhookPayload delegates to provider', async () => {
    vi.resetModules();
    const { whatsappService } = await import('./whatsapp.service');

    mockProvider.parseWebhookPayload.mockReturnValue({
      senderPhone: '34612345678',
      messageText: 'YES',
    });

    const body = { some: 'payload' };
    const result = whatsappService.parseWebhookPayload(body);

    expect(result).toEqual({ senderPhone: '34612345678', messageText: 'YES' });
    expect(mockProvider.parseWebhookPayload).toHaveBeenCalledWith(body);
  });

  it('sendInviteMessage and sendGroupMessage delegate to provider', async () => {
    vi.resetModules();
    const { whatsappService } = await import('./whatsapp.service');

    mockProvider.sendInviteMessage.mockResolvedValue({ success: true, messageId: 'm1' });
    mockProvider.sendGroupMessage.mockResolvedValue({ success: true, messageId: 'm2' });

    await whatsappService.sendInviteMessage('34612345678', 'Hi');
    await whatsappService.sendGroupMessage('group-1', 'Hello group');

    expect(mockProvider.sendInviteMessage).toHaveBeenCalledWith('34612345678', 'Hi', undefined);
    expect(mockProvider.sendGroupMessage).toHaveBeenCalledWith('group-1', 'Hello group');
  });
});
