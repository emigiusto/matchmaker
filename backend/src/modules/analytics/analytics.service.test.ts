import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Hoisted mocks ────────────────────────────────────────────────

const mockPrisma = vi.hoisted(() => ({
  userEvent: {
    createMany: vi.fn(),
    create: vi.fn(),
    findMany: vi.fn(),
  },
  user: {
    findMany: vi.fn(),
  },
  $queryRaw: vi.fn(),
}));

const mockCacheGet = vi.hoisted(() => vi.fn());
const mockCacheSet = vi.hoisted(() => vi.fn());
const mockDeleteKeysByPattern = vi.hoisted(() => vi.fn());

vi.mock('../../prisma', () => ({ prisma: mockPrisma }));
vi.mock('../../config/logger', () => ({
  logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn() },
}));
vi.mock('../../shared/cache/redis', () => ({
  cacheGet: mockCacheGet,
  cacheSet: mockCacheSet,
  deleteKeysByPattern: mockDeleteKeysByPattern,
}));

// Import AFTER mocks
import {
  ingestBatch,
  logServerEvent,
  clearAdminStatsCache,
  clearAvailabilityCache,
  getAdminStats,
} from './analytics.service';
import type { ClientEventInput } from './analytics.types';

// ─── Helpers ──────────────────────────────────────────────────────

/** Build a minimal $queryRaw sequence for getAdminStats */
function makeQueryRawSequence() {
  // getAdminStats fires $queryRaw in Promise.all groups:
  //   [dau, wau, mau, totalUsers, signupToday, signupWeek, signupMonth]              → 7
  //   [topEvents]                                                                     → 1
  //   [signupCount, matchCount, bookingCount]                                         → 3
  //   [dailyRows, newUsersDailyRows, topUsersRows, topPagesRows, pageViewsDailyRows]  → 5
  //   [liDau, liWau, liMau, liDailyRows, liTopUsersRows]                             → 5
  // Total: 21 $queryRaw calls
  const zero = [{ c: 0n }];
  return vi
    .fn()
    // DAU, WAU, MAU, totalUsers, signupToday, signupWeek, signupMonth
    .mockResolvedValueOnce(zero)  // dau
    .mockResolvedValueOnce(zero)  // wau
    .mockResolvedValueOnce(zero)  // mau
    .mockResolvedValueOnce(zero)  // totalUsers
    .mockResolvedValueOnce(zero)  // signupToday
    .mockResolvedValueOnce(zero)  // signupWeek
    .mockResolvedValueOnce(zero)  // signupMonth
    // topEvents
    .mockResolvedValueOnce([])
    // funnel
    .mockResolvedValueOnce(zero)  // signupCount
    .mockResolvedValueOnce(zero)  // matchCount
    .mockResolvedValueOnce(zero)  // bookingCount
    // daily charts
    .mockResolvedValueOnce([])    // dailyRows
    .mockResolvedValueOnce([])    // newUsersDailyRows
    .mockResolvedValueOnce([])    // topUsersRows
    .mockResolvedValueOnce([])    // topPagesRows
    .mockResolvedValueOnce([])    // pageViewsDailyRows
    // logged-in only stats
    .mockResolvedValueOnce(zero)  // liDau
    .mockResolvedValueOnce(zero)  // liWau
    .mockResolvedValueOnce(zero)  // liMau
    .mockResolvedValueOnce([])    // liDailyRows
    .mockResolvedValueOnce([]);   // liTopUsersRows
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ─── ingestBatch ──────────────────────────────────────────────────

describe('ingestBatch', () => {
  it('calls createMany with mapped event rows', async () => {
    mockPrisma.userEvent.createMany.mockResolvedValue({ count: 2 });

    const events: ClientEventInput[] = [
      { eventType: 'page.view', metadata: { path: '/' }, sessionId: 'sess1' },
      { eventType: 'auth.login' },
    ];

    await ingestBatch('user1', events);

    expect(mockPrisma.userEvent.createMany).toHaveBeenCalledOnce();
    const { data } = mockPrisma.userEvent.createMany.mock.calls[0][0];
    expect(data).toHaveLength(2);
    expect(data[0]).toMatchObject({ userId: 'user1', eventType: 'page.view', source: 'client', sessionId: 'sess1' });
    expect(data[1]).toMatchObject({ userId: 'user1', eventType: 'auth.login', source: 'client' });
  });

  it('accepts null userId for anonymous events', async () => {
    mockPrisma.userEvent.createMany.mockResolvedValue({ count: 1 });

    await ingestBatch(null, [{ eventType: 'page.view' }]);

    const { data } = mockPrisma.userEvent.createMany.mock.calls[0][0];
    expect(data[0].userId).toBeNull();
  });

  it('does nothing when the events array is empty', async () => {
    await ingestBatch('user1', []);
    expect(mockPrisma.userEvent.createMany).not.toHaveBeenCalled();
  });

  it('swallows errors and does not throw', async () => {
    mockPrisma.userEvent.createMany.mockRejectedValue(new Error('DB down'));
    await expect(ingestBatch('user1', [{ eventType: 'page.view' }])).resolves.toBeUndefined();
  });
});

// ─── logServerEvent ───────────────────────────────────────────────

describe('logServerEvent', () => {
  it('creates a server-source event with metadata', async () => {
    mockPrisma.userEvent.create.mockResolvedValue({});

    await logServerEvent('user1', 'booking.success', { matchId: 'm1' });

    expect(mockPrisma.userEvent.create).toHaveBeenCalledOnce();
    expect(mockPrisma.userEvent.create.mock.calls[0][0].data).toMatchObject({
      userId: 'user1',
      eventType: 'booking.success',
      source: 'server',
      metadata: { matchId: 'm1' },
    });
  });

  it('creates an event without metadata', async () => {
    mockPrisma.userEvent.create.mockResolvedValue({});

    await logServerEvent('user1', 'auth.login');

    const { data } = mockPrisma.userEvent.create.mock.calls[0][0];
    expect(data.metadata).toBeUndefined();
  });

  it('swallows errors and does not throw', async () => {
    mockPrisma.userEvent.create.mockRejectedValue(new Error('DB down'));
    await expect(logServerEvent('user1', 'auth.login')).resolves.toBeUndefined();
  });
});

// ─── clearAdminStatsCache ─────────────────────────────────────────

describe('clearAdminStatsCache', () => {
  it('calls deleteKeysByPattern with the analytics stats prefix', async () => {
    mockDeleteKeysByPattern.mockResolvedValue(undefined);

    await clearAdminStatsCache();

    expect(mockDeleteKeysByPattern).toHaveBeenCalledOnce();
    const [pattern] = mockDeleteKeysByPattern.mock.calls[0];
    expect(pattern).toMatch(/analytics:admin:stats/);
    expect(pattern).toMatch(/\*/); // must be a wildcard pattern
  });
});

// ─── clearAvailabilityCache ───────────────────────────────────────

describe('clearAvailabilityCache', () => {
  it('calls deleteKeysByPattern with the availability prefix', async () => {
    mockDeleteKeysByPattern.mockResolvedValue(undefined);

    await clearAvailabilityCache();

    expect(mockDeleteKeysByPattern).toHaveBeenCalledOnce();
    const [pattern] = mockDeleteKeysByPattern.mock.calls[0];
    expect(pattern).toMatch(/matchmaker:booking:availability/);
    expect(pattern).toMatch(/\*/);
  });
});

// ─── getAdminStats ────────────────────────────────────────────────

describe('getAdminStats', () => {
  it('returns cached result without hitting the DB', async () => {
    const cached = { dau: 5, wau: 10, mau: 20 };
    mockCacheGet.mockResolvedValue(JSON.stringify(cached));

    const result = await getAdminStats();

    expect(result).toEqual(cached);
    expect(mockPrisma.$queryRaw).not.toHaveBeenCalled();
  });

  it('queries the DB and caches the result on a cache miss', async () => {
    mockCacheGet.mockResolvedValue(null);
    mockCacheSet.mockResolvedValue(undefined);
    mockPrisma.$queryRaw = makeQueryRawSequence();
    mockPrisma.userEvent.findMany.mockResolvedValue([]);
    mockPrisma.user.findMany.mockResolvedValue([]);

    const result = await getAdminStats();

    expect(mockPrisma.$queryRaw).toHaveBeenCalled();
    expect(mockCacheSet).toHaveBeenCalledOnce();
    // Verify cache key includes the period
    const [cacheKey] = mockCacheSet.mock.calls[0];
    expect(cacheKey).toContain('30');
    // Result has correct zero values
    expect(result.dau).toBe(0);
    expect(result.wau).toBe(0);
    expect(result.mau).toBe(0);
    expect(result.totalUsers).toBe(0);
  });

  it('converts bigint values to numbers', async () => {
    mockCacheGet.mockResolvedValue(null);
    mockCacheSet.mockResolvedValue(undefined);
    mockPrisma.$queryRaw = vi.fn()
      .mockResolvedValueOnce([{ c: 42n }])  // dau
      .mockResolvedValueOnce([{ c: 150n }]) // wau
      .mockResolvedValueOnce([{ c: 400n }]) // mau
      .mockResolvedValueOnce([{ c: 200n }]) // totalUsers
      .mockResolvedValueOnce([{ c: 3n }])   // signupToday
      .mockResolvedValueOnce([{ c: 12n }])  // signupWeek
      .mockResolvedValueOnce([{ c: 45n }])  // signupMonth
      .mockResolvedValueOnce([{ eventType: 'page.view', c: 99n }]) // topEvents
      .mockResolvedValueOnce([{ c: 50n }])  // signupCount
      .mockResolvedValueOnce([{ c: 30n }])  // matchCount
      .mockResolvedValueOnce([{ c: 10n }])  // bookingCount
      .mockResolvedValueOnce([])    // dailyRows
      .mockResolvedValueOnce([])    // newUsersDailyRows
      .mockResolvedValueOnce([])    // topUsersRows
      .mockResolvedValueOnce([])    // topPagesRows
      .mockResolvedValueOnce([])    // pageViewsDailyRows
      .mockResolvedValueOnce([{ c: 0n }]) // liDau
      .mockResolvedValueOnce([{ c: 0n }]) // liWau
      .mockResolvedValueOnce([{ c: 0n }]) // liMau
      .mockResolvedValueOnce([])    // liDailyRows
      .mockResolvedValueOnce([]);   // liTopUsersRows
    mockPrisma.userEvent.findMany.mockResolvedValue([]);
    mockPrisma.user.findMany.mockResolvedValue([]);

    const result = await getAdminStats();

    expect(typeof result.dau).toBe('number');
    expect(result.dau).toBe(42);
    expect(result.wau).toBe(150);
    expect(result.mau).toBe(400);
    expect(result.totalUsers).toBe(200);
    expect(result.newSignups).toEqual({ today: 3, thisWeek: 12, thisMonth: 45 });
    expect(result.topEvents[0]).toEqual({ eventType: 'page.view', count: 99 });
    expect(result.funnelSteps).toEqual([
      { step: 'Signed up', count: 50 },
      { step: 'Created match', count: 30 },
      { step: 'Booked court', count: 10 },
    ]);
  });

  it('uses a separate cache key per period', async () => {
    mockCacheGet.mockResolvedValue(null);
    mockCacheSet.mockResolvedValue(undefined);
    mockPrisma.$queryRaw = makeQueryRawSequence();
    mockPrisma.userEvent.findMany.mockResolvedValue([]);
    mockPrisma.user.findMany.mockResolvedValue([]);

    await getAdminStats(7);

    const [cacheKey] = mockCacheSet.mock.calls[0];
    expect(cacheKey).toContain('7');
    expect(cacheKey).not.toContain('30');
  });

  it('includes eventType in cache key when filter is provided', async () => {
    mockCacheGet.mockResolvedValue(null);
    mockCacheSet.mockResolvedValue(undefined);
    mockPrisma.$queryRaw = makeQueryRawSequence();
    mockPrisma.userEvent.findMany.mockResolvedValue([]);
    mockPrisma.user.findMany.mockResolvedValue([]);

    await getAdminStats(30, 'page.view');

    const [cacheKey] = mockCacheSet.mock.calls[0];
    expect(cacheKey).toContain('page.view');
  });

  it('maps recentEvents with user name and email', async () => {
    mockCacheGet.mockResolvedValue(null);
    mockCacheSet.mockResolvedValue(undefined);
    mockPrisma.$queryRaw = makeQueryRawSequence();
    mockPrisma.user.findMany.mockResolvedValue([]);
    mockPrisma.userEvent.findMany.mockResolvedValue([
      {
        id: 'ev1',
        userId: 'user1',
        eventType: 'auth.login',
        metadata: null,
        source: 'server',
        createdAt: new Date('2026-03-24T10:00:00Z'),
        user: { name: 'Alice', email: 'alice@example.com' },
      },
    ]);

    const result = await getAdminStats();

    expect(result.recentEvents).toHaveLength(1);
    expect(result.recentEvents[0]).toMatchObject({
      id: 'ev1',
      userId: 'user1',
      userName: 'Alice',
      userEmail: 'alice@example.com',
      eventType: 'auth.login',
      source: 'server',
    });
  });

  it('handles missing user gracefully (null name and email)', async () => {
    mockCacheGet.mockResolvedValue(null);
    mockCacheSet.mockResolvedValue(undefined);
    mockPrisma.$queryRaw = makeQueryRawSequence();
    mockPrisma.user.findMany.mockResolvedValue([]);
    mockPrisma.userEvent.findMany.mockResolvedValue([
      {
        id: 'ev2',
        userId: null,
        eventType: 'page.view',
        metadata: { path: '/' },
        source: 'client',
        createdAt: new Date('2026-03-24T11:00:00Z'),
        user: null,
      },
    ]);

    const result = await getAdminStats();

    expect(result.recentEvents[0]).toMatchObject({
      userId: null,
      userName: null,
      userEmail: null,
    });
  });

  it('continues and returns zeros if Redis cache throws', async () => {
    mockCacheGet.mockRejectedValue(new Error('Redis down'));
    mockCacheSet.mockRejectedValue(new Error('Redis down'));
    mockPrisma.$queryRaw = makeQueryRawSequence();
    mockPrisma.userEvent.findMany.mockResolvedValue([]);
    mockPrisma.user.findMany.mockResolvedValue([]);

    const result = await getAdminStats();

    expect(result.dau).toBe(0);
  });
});
