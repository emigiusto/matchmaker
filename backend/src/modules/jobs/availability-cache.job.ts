// availability-cache.job.ts
// Proactively warms the Redis court availability cache for all active club memberships.
// Runs every 15 minutes, pre-fetching the next 15 days for each sport.
// Requests are sequential per membership to avoid hammering the club portal.

import cron from 'node-cron'
import { prisma } from '../../prisma'
import { getAdapter } from '../booking/adapters/adapter.registry'
import { decrypt } from '../../shared/utils/crypto.utils'
import { cacheSet, redisAvailable } from '../../shared/cache/redis'
import { logger } from '../../config/logger'
import type { CourtAvailabilityResult } from '../booking/booking.types'

const SPORTS = ['tennis', 'padel']
const CACHE_TTL_SECONDS = 1800 // 30 minutes
const DAYS_AHEAD = 10

function nextNDays(n: number): string[] {
  const dates: string[] = []
  const now = new Date()
  for (let i = 0; i < n; i++) {
    const d = new Date(now)
    d.setDate(now.getDate() + i)
    dates.push(d.toISOString().slice(0, 10))
  }
  return dates
}

async function warmAvailabilityCache(): Promise<void> {
  if (!redisAvailable()) {
    logger.warn('[availability-cache-job] Redis not available, skipping cache warm')
    return
  }

  const memberships = await prisma.clubMembership.findMany({
    where: { status: 'active', encryptedPassword: { not: null } },
  })

  if (memberships.length === 0) return

  const dates = nextNDays(DAYS_AHEAD)
  logger.info(`[availability-cache-job] Warming cache: ${memberships.length} membership(s), ${dates.length} days, sports=${SPORTS.join('/')}`)

  for (const membership of memberships) {
    const adapter = getAdapter(membership.adapterType)
    const creds = {
      socioNumber: membership.socioNumber,
      password: decrypt(membership.encryptedPassword!),
    }

    for (const sport of SPORTS) {
      for (const date of dates) {
        const cacheKey = `matchmaker:booking:availability:${membership.adapterType}:${membership.clubSlug}:${date}:${sport}`
        try {
          const result: CourtAvailabilityResult = await adapter.checkAvailability(creds, date, undefined, { sport })
          await cacheSet(cacheKey, JSON.stringify(result), CACHE_TTL_SECONDS)
          logger.info(`[availability-cache-job] Cached ${membership.clubSlug}/${sport}/${date}: ${result.availableCourts.length} courts`)
        } catch (err) {
          logger.warn(`[availability-cache-job] Failed ${membership.clubSlug}/${sport}/${date}: ${err instanceof Error ? err.message : err}`)
        }
      }
    }
  }

  logger.info('[availability-cache-job] Cache warm complete')
}

export function scheduleAvailabilityCacheJob() {
  cron.schedule('*/30 * * * *', async () => {
    try {
      await warmAvailabilityCache()
    } catch (err) {
      logger.error('[availability-cache-job] Unhandled error:', err instanceof Error ? err.message : String(err))
    }
  })
  logger.info('Availability cache job scheduled (every 15 minutes)')
}
