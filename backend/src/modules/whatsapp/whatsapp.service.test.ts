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
vi.mock('../../config/logger', () => ({ logger: { info: vi.fn() } }));

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

    expect(result).toEqual({ success: true, groupId: 'existing-group-456' });
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

    expect(result).toEqual({ success: true, groupId: 'group-789' });
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

    expect(mockProvider.sendInviteMessage).toHaveBeenCalledWith('34612345678', 'Hi');
    expect(mockProvider.sendGroupMessage).toHaveBeenCalledWith('group-1', 'Hello group');
  });
});
