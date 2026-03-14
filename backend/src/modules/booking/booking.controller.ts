// booking.controller.ts

import type { Request, Response, NextFunction } from 'express'
import {
  upsertClubMembership,
  listClubMemberships,
  getClubMembership,
  deleteClubMembership,
  testClubConnection,
  getBookingAttemptByMatch,
  retryBookingForMatch,
} from './booking.service'
import { AppError } from '../../shared/errors/AppError'

export class BookingController {
  // GET /booking/memberships?userId=...
  static async listMemberships(req: Request, res: Response, next: NextFunction) {
    try {
      const { userId } = req.query
      if (!userId || typeof userId !== 'string') {
        return res.status(400).json({ error: 'Missing userId' })
      }
      const memberships = await listClubMemberships(userId)
      res.json(memberships)
    } catch (err) { next(err) }
  }

  // PUT /booking/memberships
  static async upsertMembership(req: Request, res: Response, next: NextFunction) {
    try {
      const { userId, clubSlug, adapterType, socioNumber, password } = req.body
      if (!userId || !clubSlug || !adapterType || !socioNumber) {
        return res.status(400).json({ error: 'Missing required fields: userId, clubSlug, adapterType, socioNumber' })
      }
      const membership = await upsertClubMembership({ userId, clubSlug, adapterType, socioNumber, password })
      res.json(membership)
    } catch (err) { next(err) }
  }

  // DELETE /booking/memberships/:clubSlug?userId=...
  static async deleteMembership(req: Request, res: Response, next: NextFunction) {
    try {
      const { userId } = req.query
      const clubSlug = String(req.params.clubSlug)
      if (!userId || typeof userId !== 'string') {
        return res.status(400).json({ error: 'Missing userId' })
      }
      await deleteClubMembership(userId, clubSlug)
      res.status(204).send()
    } catch (err) { next(err) }
  }

  // POST /booking/memberships/:clubSlug/test?userId=...
  static async testConnection(req: Request, res: Response, next: NextFunction) {
    try {
      const { userId } = req.query
      const clubSlug = String(req.params.clubSlug)
      if (!userId || typeof userId !== 'string') {
        return res.status(400).json({ error: 'Missing userId' })
      }
      const ok = await testClubConnection(userId, clubSlug)
      res.json({ success: ok })
    } catch (err) { next(err) }
  }

  // GET /booking/attempts/:matchId
  static async getAttempt(req: Request, res: Response, next: NextFunction) {
    try {
      const matchId = String(req.params.matchId)
      const attempt = await getBookingAttemptByMatch(matchId)
      if (!attempt) return res.status(404).json({ error: 'No booking attempt for this match' })
      res.json(attempt)
    } catch (err) { next(err) }
  }

  // POST /booking/attempts/:matchId/retry
  static async retryAttempt(req: Request, res: Response, next: NextFunction) {
    try {
      const matchId = String(req.params.matchId)
      await retryBookingForMatch(matchId)
      res.json({ queued: true })
    } catch (err) { next(err) }
  }
}
