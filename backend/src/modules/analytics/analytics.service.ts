import { prisma } from '../../prisma'
import { logger } from '../../config/logger'
import { cacheGet, cacheSet } from '../../shared/cache/redis'
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
 * Aggregate stats for the admin dashboard.
 * Results are cached in Redis for 5 minutes.
 */
export async function getAdminStats(): Promise<AdminStatsDTO> {
  try {
    const cached = await cacheGet(ADMIN_STATS_CACHE_KEY)
    if (cached) return JSON.parse(cached) as AdminStatsDTO
  } catch { /* ignore */ }

  const now = new Date()
  const todayStart = new Date(now)
  todayStart.setHours(0, 0, 0, 0)
  const minus7 = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
  const minus30 = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
  const minus14 = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000)

  // DAU / WAU / MAU — distinct userIds
  const [dauRows, wauRows, mauRows] = await Promise.all([
    prisma.$queryRaw<[{ c: bigint }]>`
      SELECT COUNT(DISTINCT userId) AS c FROM UserEvent
      WHERE userId IS NOT NULL AND createdAt >= ${todayStart}`,
    prisma.$queryRaw<[{ c: bigint }]>`
      SELECT COUNT(DISTINCT userId) AS c FROM UserEvent
      WHERE userId IS NOT NULL AND createdAt >= ${minus7}`,
    prisma.$queryRaw<[{ c: bigint }]>`
      SELECT COUNT(DISTINCT userId) AS c FROM UserEvent
      WHERE userId IS NOT NULL AND createdAt >= ${minus30}`,
  ])

  // Top 10 event types (last 30 days)
  const topEventRows = await prisma.$queryRaw<Array<{ eventType: string; c: bigint }>>`
    SELECT eventType, COUNT(*) AS c FROM UserEvent
    WHERE createdAt >= ${minus30}
    GROUP BY eventType ORDER BY c DESC LIMIT 10`

  // Funnel — cumulative: signups → had a match → had a booking
  const [signupCount, matchCount, bookingCount] = await Promise.all([
    prisma.$queryRaw<[{ c: bigint }]>`SELECT COUNT(DISTINCT userId) AS c FROM UserEvent WHERE eventType = 'auth.signup'`,
    prisma.$queryRaw<[{ c: bigint }]>`SELECT COUNT(DISTINCT userId) AS c FROM UserEvent WHERE eventType = 'match.created'`,
    prisma.$queryRaw<[{ c: bigint }]>`SELECT COUNT(DISTINCT userId) AS c FROM UserEvent WHERE eventType = 'booking.success'`,
  ])

  // Daily active users for the last 14 days
  const dailyRows = await prisma.$queryRaw<Array<{ date: string; c: bigint }>>`
    SELECT DATE(createdAt) AS date, COUNT(DISTINCT userId) AS c
    FROM UserEvent
    WHERE userId IS NOT NULL AND createdAt >= ${minus14}
    GROUP BY DATE(createdAt)
    ORDER BY date ASC`

  // Recent 50 events, with user name + email joined
  const recentEvents = await prisma.userEvent.findMany({
    orderBy: { createdAt: 'desc' },
    take: 50,
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
    topEvents: topEventRows.map((r) => ({ eventType: r.eventType, count: Number(r.c) })),
    funnelSteps: [
      { step: 'Signed up', count: Number(signupCount[0]?.c ?? 0) },
      { step: 'Created match', count: Number(matchCount[0]?.c ?? 0) },
      { step: 'Booked court', count: Number(bookingCount[0]?.c ?? 0) },
    ],
    activeUsersDaily: dailyRows.map((r) => ({ date: r.date, count: Number(r.c) })),
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
    await cacheSet(ADMIN_STATS_CACHE_KEY, JSON.stringify(stats), ADMIN_STATS_CACHE_TTL)
  } catch { /* ignore */ }

  return stats
}
