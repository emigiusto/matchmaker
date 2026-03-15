// booking.routes.ts

import { Router } from 'express'
import { BookingController } from './booking.controller'

const router = Router()

router.get('/memberships', BookingController.listMemberships)
router.put('/memberships', BookingController.upsertMembership)
router.delete('/memberships/:clubSlug', BookingController.deleteMembership)
router.post('/memberships/:clubSlug/test', BookingController.testConnection)
router.get('/attempts/:matchId', BookingController.getAttempt)
router.post('/attempts/:matchId/retry', BookingController.retryAttempt)
router.post('/attempts/:matchId/cancel', BookingController.cancelAttempt)

export default router
