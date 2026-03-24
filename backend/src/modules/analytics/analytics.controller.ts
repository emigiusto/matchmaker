import type { Request, Response, NextFunction } from 'express'
import { ingestBatch, getAdminStats, clearAdminStatsCache, clearAvailabilityCache } from './analytics.service'
import { verifyToken } from '../auth/auth.service'
import { prisma } from '../../prisma'
import { AppError } from '../../shared/errors/AppError'
import { logServerEvent } from './analytics.service'
import jwt from 'jsonwebtoken'
import type { ClientEventInput } from './analytics.types'

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-in-production'

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

  static async impersonate(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = req.params.userId as string
      const adminId = (req as any).userId as string

      const target = await prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, name: true, email: true, isGuest: true, isAdmin: true, onboardingCompleted: true },
      })
      if (!target) throw new AppError('User not found', 404)
      if (target.isAdmin) throw new AppError('Cannot impersonate another admin', 403)

      const token = jwt.sign({ userId: target.id, impersonatedBy: adminId }, JWT_SECRET, { expiresIn: '1h' })
      void logServerEvent(adminId, 'admin.impersonate', { targetUserId: target.id })

      res.json({ token, user: target })
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
