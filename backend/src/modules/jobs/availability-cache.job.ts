// availability-cache.job.ts
// Proactively warms the Redis court availability cache for all active clubs.
// Runs every 30 minutes, pre-fetching the next 10 days for each sport.
// Deduplicated by club — one fetch per (adapterType, clubSlug) regardless of how many members share it.
// Requests are sequential per club to avoid hammering the club portal.

import cron from 'node-cron'
import { prisma } from '../../prisma'
import { getAdapter } from '../booking/adapters/adapter.registry'
import { decrypt } from '../../shared/utils/crypto.utils'
import { cacheSet, redisAvailable } from '../../shared/cache/redis'
import { logger } from '../../config/logger'
import { AppError } from '../../shared/errors/AppError'
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

  const allMemberships = await prisma.clubMembership.findMany({
    where: { status: 'active', encryptedPassword: { not: null } },
  })

  // Deduplicate by club — cache is shared per (adapterType, clubSlug), so one membership per club is enough
  const seen = new Set<string>()
  const memberships = allMemberships.filter(m => {
    const key = `${m.adapterType}:${m.clubSlug}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })

  if (memberships.length === 0) return

  const dates = nextNDays(DAYS_AHEAD)
  logger.info(`[availability-cache-job] Warming cache: ${memberships.length} club(s), ${dates.length} days, sports=${SPORTS.join('/')}`)

  for (const membership of memberships) {
    const adapter = getAdapter(membership.adapterType)
    const creds = {
      socioNumber: membership.socioNumber,
      password: decrypt(membership.encryptedPassword!),
    }

    for (const sport of SPORTS) {
      let credentialsInvalid = false
      for (const date of dates) {
        if (credentialsInvalid) break
        const cacheKey = `matchmaker:booking:availability:${membership.adapterType}:${membership.clubSlug}:${date}:${sport}`
        try {
          const result: CourtAvailabilityResult = await adapter.checkAvailability(creds, date, undefined, { sport })
          await cacheSet(cacheKey, JSON.stringify(result), CACHE_TTL_SECONDS)
        } catch (err) {
          if (err instanceof AppError && err.errorCode === 'INVALID_CLUB_CREDENTIALS') {
            logger.warn(`[availability-cache-job] Invalid credentials for ${membership.clubSlug} (socio ${membership.socioNumber}) — marking invalid, skipping remaining dates`)
            await prisma.clubMembership.update({ where: { id: membership.id }, data: { status: 'invalid_credentials' } }).catch(() => {})
            credentialsInvalid = true
            break
          }
          logger.warn(`[availability-cache-job] Failed ${membership.clubSlug}/${sport}/${date}: ${err instanceof Error ? err.message : err}`)
        }
      }
      if (credentialsInvalid) break
    }
  }

}

export function scheduleAvailabilityCacheJob() {
  cron.schedule('*/30 * * * *', async () => {
    try {
      await warmAvailabilityCache()
    } catch (err) {
      logger.error('[availability-cache-job] Unhandled error:', err instanceof Error ? err.message : String(err))
    }
  })
  logger.info('Availability cache job scheduled (every 30 minutes)')
}
