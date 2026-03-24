import type { Request, Response, NextFunction } from 'express'
import { ingestBatch, getAdminStats, clearAdminStatsCache, clearAvailabilityCache } from './analytics.service'
import { verifyToken } from '../auth/auth.service'
import type { ClientEventInput } from './analytics.types'

export class AnalyticsController {
  /**
   * POST /analytics/events
   * Accepts a batch of client events. Responds 202 immediately.
   * Auth is optional — userId is taken from Bearer token if present.
   */
  static async ingest(req: Request, res: Response, next: NextFunction) {
    try {
      const authHeader = req.headers.authorization
      let userId: string | null = null
      if (authHeader?.startsWith('Bearer ')) {
        try {
          userId = verifyToken(authHeader.slice(7)).userId
        } catch { /* unauthenticated — fine */ }
      }

      const events: ClientEventInput[] = Array.isArray(req.body?.events)
        ? (req.body.events as unknown[])
            .filter((e): e is ClientEventInput =>
              typeof e === 'object' && e !== null && typeof (e as ClientEventInput).eventType === 'string',
            )
            .slice(0, 50) // max 50 per batch
        : []

      void ingestBatch(userId, events)
      res.status(202).end()
    } catch (err) {
      next(err)
    }
  }

  /**
   * GET /analytics/admin/stats
   * Returns aggregated stats. Requires isAdmin.
   */
  static async clearCache(req: Request, res: Response, next: NextFunction) {
    try {
      await clearAdminStatsCache()
      res.json({ ok: true })
    } catch (err) {
      next(err)
    }
  }

  static async clearAvailabilityCache(req: Request, res: Response, next: NextFunction) {
    try {
      await clearAvailabilityCache()
      res.json({ ok: true })
    } catch (err) {
      next(err)
    }
  }

  static async stats(req: Request, res: Response, next: NextFunction) {
    try {
      const rawDays = parseInt(req.query.days as string, 10)
      const days = [7, 14, 30, 90].includes(rawDays) ? rawDays : 30
      const eventTypeFilter = typeof req.query.eventType === 'string' && req.query.eventType ? req.query.eventType : undefined
      const data = await getAdminStats(days, eventTypeFilter)
      res.json(data)
    } catch (err) {
      next(err)
    }
  }
}
