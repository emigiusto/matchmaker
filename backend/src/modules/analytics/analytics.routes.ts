import { Router } from 'express'
import { AnalyticsController } from './analytics.controller'
import { requireAdmin } from '../../shared/middleware/requireAdmin'

const router = Router()

router.post('/events', AnalyticsController.ingest)
router.get('/admin/stats', requireAdmin, AnalyticsController.stats)

export default router
