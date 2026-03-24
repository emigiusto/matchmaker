import { prisma } from '../../prisma'
import { logger } from '../../config/logger'
import { cacheGet, cacheSet, deleteKeysByPattern } from '../../shared/cache/redis'
import type { ClientEventInput, AdminStatsDTO } from './analytics.types'
import type { Prisma } from '@prisma/client'

const ADMIN_STATS_CACHE_KEY = 'analytics:admin:stats'
const ADMIN_STATS_CACHE_TTL = 300 // 5 minutes

/**
 * Ingest a batch of client-side events.
 * Always resolves — never throws to the caller.
 */
export async function ingestBatch(
  userId: string | null,
  events: ClientEventInput[],
): Promise<void> {
  if (!events.length) return
  try {
    await prisma.userEvent.createMany({
      data: events.map((e) => ({
        userId: userId ?? null,
        eventType: e.eventType,
        metadata: (e.metadata ?? undefined) as Prisma.InputJsonValue | undefined,
        sessionId: e.sessionId ?? null,
        source: 'client',
      })),
    })
  } catch (err) {
    logger.warn('[analytics] ingestBatch failed:', err instanceof Error ? err.message : err)
  }
}

/**
 * Log a single server-side event. Fire-and-forget — callers should `void` this.
 */
export async function logServerEvent(
  userId: string,
  eventType: string,
  metadata?: Record<string, unknown>,
): Promise<void> {
  try {
    await prisma.userEvent.create({
      data: { userId, eventType, metadata: (metadata ?? undefined) as Prisma.InputJsonValue | undefined, source: 'server' },
    })
  } catch (err) {
    logger.warn(`[analytics] logServerEvent(${eventType}) failed:`, err instanceof Error ? err.message : err)
  }
}

/**
 * Clear all cached admin stats (all periods).
 */
export async function clearAdminStatsCache(): Promise<void> {
  await deleteKeysByPattern(`${ADMIN_STATS_CACHE_KEY}:*`)
}

/**
 * Clear all cached availability results.
 */
export async function clearAvailabilityCache(): Promise<void> {
  await deleteKeysByPattern('matchmaker:booking:availability:*')
}

/**
 * Aggregate stats for the admin dashboard.
 * Results are cached in Redis for 5 minutes per period.
 */
export async function getAdminStats(days = 30, eventTypeFilter?: string): Promise<AdminStatsDTO> {
  const cacheKey = `${ADMIN_STATS_CACHE_KEY}:${days}${eventTypeFilter ? `:${eventTypeFilter}` : ''}`
  try {
    const cached = await cacheGet(cacheKey)
    if (cached) return JSON.parse(cached) as AdminStatsDTO
  } catch { /* ignore */ }

  const now = new Date()
  const todayStart = new Date(now)
  todayStart.setHours(0, 0, 0, 0)
  const minus7 = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
  const minus30 = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
  const minusDays = new Date(now.getTime() - days * 24 * 60 * 60 * 1000)

  // DAU / WAU / MAU — distinct userIds
  const [dauRows, wauRows, mauRows, totalUsersRow, signupTodayRow, signupWeekRow, signupMonthRow] = await Promise.all([
    prisma.$queryRaw<[{ c: bigint }]>`
      SELECT COUNT(DISTINCT userId) AS c FROM UserEvent
      WHERE userId IS NOT NULL AND createdAt >= ${todayStart}`,
    prisma.$queryRaw<[{ c: bigint }]>`
      SELECT COUNT(DISTINCT userId) AS c FROM UserEvent
      WHERE userId IS NOT NULL AND createdAt >= ${minus7}`,
    prisma.$queryRaw<[{ c: bigint }]>`
      SELECT COUNT(DISTINCT userId) AS c FROM UserEvent
      WHERE userId IS NOT NULL AND createdAt >= ${minus30}`,
    prisma.$queryRaw<[{ c: bigint }]>`
      SELECT COUNT(*) AS c FROM User WHERE isGuest = 0 AND isAdmin = 0`,
    prisma.$queryRaw<[{ c: bigint }]>`
      SELECT COUNT(DISTINCT userId) AS c FROM UserEvent
      WHERE eventType = 'auth.signup' AND createdAt >= ${todayStart}`,
    prisma.$queryRaw<[{ c: bigint }]>`
      SELECT COUNT(DISTINCT userId) AS c FROM UserEvent
      WHERE eventType = 'auth.signup' AND createdAt >= ${minus7}`,
    prisma.$queryRaw<[{ c: bigint }]>`
      SELECT COUNT(DISTINCT userId) AS c FROM UserEvent
      WHERE eventType = 'auth.signup' AND createdAt >= ${minus30}`,
  ])

  // Top 10 event types (selected period)
  const topEventRows = await prisma.$queryRaw<Array<{ eventType: string; c: bigint }>>`
    SELECT eventType, COUNT(*) AS c FROM UserEvent
    WHERE createdAt >= ${minusDays}
    GROUP BY eventType ORDER BY c DESC LIMIT 10`

  // Funnel — cumulative all-time: signups → had a match → had a booking
  const [signupCount, matchCount, bookingCount] = await Promise.all([
    prisma.$queryRaw<[{ c: bigint }]>`SELECT COUNT(DISTINCT userId) AS c FROM UserEvent WHERE eventType = 'auth.signup'`,
    prisma.$queryRaw<[{ c: bigint }]>`SELECT COUNT(DISTINCT userId) AS c FROM UserEvent WHERE eventType = 'match.created'`,
    prisma.$queryRaw<[{ c: bigint }]>`SELECT COUNT(DISTINCT userId) AS c FROM UserEvent WHERE eventType = 'booking.success'`,
  ])

  // Daily charts + top users + page analytics — use selected period
  const [dailyRows, newUsersDailyRows, topUsersRows, topPagesRows, pageViewsDailyRows] = await Promise.all([
    prisma.$queryRaw<Array<{ date: string; c: bigint }>>`
      SELECT DATE(createdAt) AS date, COUNT(DISTINCT userId) AS c
      FROM UserEvent
      WHERE userId IS NOT NULL AND createdAt >= ${minusDays}
      GROUP BY DATE(createdAt)
      ORDER BY date ASC`,
    prisma.$queryRaw<Array<{ date: string; c: bigint }>>`
      SELECT DATE(createdAt) AS date, COUNT(DISTINCT userId) AS c
      FROM UserEvent
      WHERE eventType = 'auth.signup' AND createdAt >= ${minusDays}
      GROUP BY DATE(createdAt)
      ORDER BY date ASC`,
    prisma.$queryRaw<Array<{ userId: string; eventCount: bigint; lastSeenAt: string }>>`
      SELECT userId, COUNT(*) AS eventCount, MAX(createdAt) AS lastSeenAt
      FROM UserEvent
      WHERE userId IS NOT NULL AND createdAt >= ${minusDays}
      GROUP BY userId
      ORDER BY eventCount DESC
      LIMIT 20`,
    prisma.$queryRaw<Array<{ path: string; views: bigint; uniques: bigint }>>`
      SELECT JSON_UNQUOTE(JSON_EXTRACT(metadata, '$.path')) AS path,
             COUNT(*) AS views,
             COUNT(DISTINCT userId) AS uniques
      FROM UserEvent
      WHERE eventType = 'page.view'
        AND createdAt >= ${minusDays}
        AND JSON_EXTRACT(metadata, '$.path') IS NOT NULL
      GROUP BY path
      ORDER BY views DESC
      LIMIT 20`,
    prisma.$queryRaw<Array<{ date: string; views: bigint }>>`
      SELECT DATE(createdAt) AS date, COUNT(*) AS views
      FROM UserEvent
      WHERE eventType = 'page.view' AND createdAt >= ${minusDays}
      GROUP BY DATE(createdAt)
      ORDER BY date ASC`,
  ])

  // Resolve user info for top users
  const topUserIds = topUsersRows.map((r) => r.userId)
  const topUserDetails = topUserIds.length
    ? await prisma.user.findMany({
        where: { id: { in: topUserIds } },
        select: { id: true, name: true, email: true },
      })
    : []
  const topUserMap = new Map(topUserDetails.map((u) => [u.id, u]))

  // Recent 100 events, with optional eventType filter + user name/email joined
  const recentEvents = await prisma.userEvent.findMany({
    where: eventTypeFilter ? { eventType: eventTypeFilter } : undefined,
    orderBy: { createdAt: 'desc' },
    take: 100,
    select: {
      id: true,
      userId: true,
      eventType: true,
      metadata: true,
      source: true,
      createdAt: true,
      user: { select: { name: true, email: true } },
    },
  })

  const stats: AdminStatsDTO = {
    dau: Number(dauRows[0]?.c ?? 0),
    wau: Number(wauRows[0]?.c ?? 0),
    mau: Number(mauRows[0]?.c ?? 0),
    totalUsers: Number(totalUsersRow[0]?.c ?? 0),
    newSignups: {
      today: Number(signupTodayRow[0]?.c ?? 0),
      thisWeek: Number(signupWeekRow[0]?.c ?? 0),
      thisMonth: Number(signupMonthRow[0]?.c ?? 0),
    },
    topEvents: topEventRows.map((r) => ({ eventType: r.eventType, count: Number(r.c) })),
    funnelSteps: [
      { step: 'Signed up', count: Number(signupCount[0]?.c ?? 0) },
      { step: 'Created match', count: Number(matchCount[0]?.c ?? 0) },
      { step: 'Booked court', count: Number(bookingCount[0]?.c ?? 0) },
    ],
    activeUsersDaily: dailyRows.map((r) => ({ date: r.date, count: Number(r.c) })),
    newUsersDaily: newUsersDailyRows.map((r) => ({ date: r.date, count: Number(r.c) })),
    topPages: topPagesRows.map((r) => ({
      path: r.path,
      views: Number(r.views),
      uniques: Number(r.uniques),
    })),
    pageViewsDaily: pageViewsDailyRows.map((r) => ({
      date: r.date,
      views: Number(r.views),
    })),
    topUsers: topUsersRows.map((r) => {
      const u = topUserMap.get(r.userId)
      return {
        userId: r.userId,
        email: u?.email ?? null,
        name: u?.name ?? null,
        eventCount: Number(r.eventCount),
        lastSeenAt: typeof r.lastSeenAt === 'string' ? r.lastSeenAt : (r.lastSeenAt as Date).toISOString(),
      }
    }),
    recentEvents: recentEvents.map((e) => ({
      id: e.id,
      userId: e.userId,
      userEmail: e.user?.email ?? null,
      userName: e.user?.name ?? null,
      eventType: e.eventType,
      metadata: e.metadata,
      source: e.source,
      createdAt: e.createdAt.toISOString(),
    })),
  }

  try {
    await cacheSet(cacheKey, JSON.stringify(stats), ADMIN_STATS_CACHE_TTL)
  } catch { /* ignore */ }

  return stats
}
