import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AppError } from '../../shared/errors/AppError';

// ─── Hoisted mocks ────────────────────────────────────────────────

const mockPrisma = vi.hoisted(() => ({
  match: {
    findUnique: vi.fn(),
  },
}));

const mockWhatsapp = vi.hoisted(() => ({
  getGroupInviteLink: vi.fn(),
}));

vi.mock('../../prisma', () => ({ prisma: mockPrisma }));
vi.mock('../whatsapp/whatsapp.service', () => ({ whatsappService: mockWhatsapp }));
vi.mock('../../config/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock('../rating/rating.service', () => ({ RatingService: {} }));
vi.mock('../notifications/notifications.service', () => ({ createNotification: vi.fn() }));
vi.mock('../results/results.service', () => ({ validateResultMatchConsistency: vi.fn() }));

// Import AFTER mocks
import { getMatchById, getWhatsappGroupLink } from './matches.service';

// ─── Fixtures ─────────────────────────────────────────────────────

const startTime = new Date('2026-03-15T09:00:00Z'); // 09:00 UTC
const endTime   = new Date('2026-03-15T10:00:00Z');

const baseMatch = {
  id: 'match1',
  inviteId: null,
  availabilityId: 'av1',
  venueId: null,
  playerAId: null,
  playerBId: null,
  scheduledAt: startTime,
  createdAt: startTime,
  status: 'scheduled',
  type: 'competitive',
  whatsappGroupId: null,
  availability: {
    locationText: 'Court 1',
    date: new Date('2026-03-15'),
    startTime,
    endTime,
  },
  schedulingRequest: { sportType: 'tennis', format: 'singles', timezone: 'UTC' },
  participants: [
    { userId: 'user1', team: 'A', user: { id: 'user1', name: 'Alice' } },
    { userId: 'user2', team: 'B', user: { id: 'user2', name: 'Bob' } },
  ],
};

beforeEach(() => {
  vi.clearAllMocks();
});

// ─── getMatchById ─────────────────────────────────────────────────

describe('getMatchById', () => {
  it('returns a MatchDTO when the match exists', async () => {
    mockPrisma.match.findUnique.mockResolvedValue(baseMatch);

    const result = await getMatchById('match1');

    expect(result.id).toBe('match1');
    expect(result.status).toBe('scheduled');
    expect(result.location).toBe('Court 1');
    expect(result.participants).toHaveLength(2);
  });

  it('throws 404 when the match does not exist', async () => {
    mockPrisma.match.findUnique.mockResolvedValue(null);

    await expect(getMatchById('missing')).rejects.toThrow(AppError);
    await expect(getMatchById('missing')).rejects.toThrow('Match not found');
  });

  it('includes sport and format from schedulingRequest', async () => {
    mockPrisma.match.findUnique.mockResolvedValue({
      ...baseMatch,
      schedulingRequest: { sportType: 'padel', format: 'doubles', timezone: 'UTC' },
      participants: [
        { userId: 'u1', team: 'A', user: { id: 'u1', name: 'A1' } },
        { userId: 'u2', team: 'A', user: { id: 'u2', name: 'A2' } },
        { userId: 'u3', team: 'B', user: { id: 'u3', name: 'B1' } },
        { userId: 'u4', team: 'B', user: { id: 'u4', name: 'B2' } },
      ],
    });

    const result = await getMatchById('match1');

    expect(result.sportType).toBe('padel');
    expect(result.format).toBe('doubles');
  });

  it('exposes whatsappGroupId when set', async () => {
    mockPrisma.match.findUnique.mockResolvedValue({
      ...baseMatch,
      whatsappGroupId: '120363abc@g.us',
    });

    const result = await getMatchById('match1');

    expect(result.whatsappGroupId).toBe('120363abc@g.us');
  });

  it('formats time in UTC when no timezone on schedulingRequest', async () => {
    // 09:00 UTC → expect "09:00"
    mockPrisma.match.findUnique.mockResolvedValue({
      ...baseMatch,
      schedulingRequest: { sportType: 'tennis', format: 'singles', timezone: 'UTC' },
    });

    const result = await getMatchById('match1');

    expect(result.time).toBe('09:00');
  });

  it('formats time in local timezone (UTC offset applied)', async () => {
    // startTime = 09:00 UTC; Europe/Madrid in March = UTC+1 → expect "10:00"
    mockPrisma.match.findUnique.mockResolvedValue({
      ...baseMatch,
      schedulingRequest: { sportType: 'tennis', format: 'singles', timezone: 'Europe/Madrid' },
    });

    const result = await getMatchById('match1');

    expect(result.time).toBe('10:00');
  });
});

// ─── getWhatsappGroupLink ─────────────────────────────────────────

describe('getWhatsappGroupLink', () => {
  it('returns the invite link from the provider', async () => {
    mockPrisma.match.findUnique.mockResolvedValue({ whatsappGroupId: '120363abc@g.us' });
    mockWhatsapp.getGroupInviteLink.mockResolvedValue({
      success: true,
      inviteLink: 'https://chat.whatsapp.com/AbCdEfGh',
    });

    const link = await getWhatsappGroupLink('match1');

    expect(link).toBe('https://chat.whatsapp.com/AbCdEfGh');
    expect(mockWhatsapp.getGroupInviteLink).toHaveBeenCalledWith('120363abc@g.us');
  });

  it('throws 404 when match does not exist', async () => {
    mockPrisma.match.findUnique.mockResolvedValue(null);

    await expect(getWhatsappGroupLink('missing')).rejects.toThrow(AppError);
    await expect(getWhatsappGroupLink('missing')).rejects.toThrow('Match not found');
  });

  it('throws 404 when match has no WhatsApp group', async () => {
    mockPrisma.match.findUnique.mockResolvedValue({ whatsappGroupId: null });

    await expect(getWhatsappGroupLink('match1')).rejects.toThrow(AppError);
    await expect(getWhatsappGroupLink('match1')).rejects.toThrow('No WhatsApp group');
  });

  it('throws 502 when provider fails to return invite link', async () => {
    mockPrisma.match.findUnique.mockResolvedValue({ whatsappGroupId: '120363abc@g.us' });
    mockWhatsapp.getGroupInviteLink.mockResolvedValue({
      success: false,
      error: 'Group not found',
    });

    await expect(getWhatsappGroupLink('match1')).rejects.toThrow(AppError);
    const err = await getWhatsappGroupLink('match1').catch((e) => e as AppError);
    expect(err.statusCode).toBe(502);
    expect(err.message).toContain('Group not found');
  });
});
