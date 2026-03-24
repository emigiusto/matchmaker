import { Router } from 'express'
import { AnalyticsController } from './analytics.controller'
import { requireAdmin } from '../../shared/middleware/requireAdmin'

const router = Router()

router.post('/events', AnalyticsController.ingest)
router.get('/admin/stats', requireAdmin, AnalyticsController.stats)
router.post('/admin/cache/clear', requireAdmin, AnalyticsController.clearCache)
router.post('/admin/cache/clear-availability', requireAdmin, AnalyticsController.clearAvailabilityCache)
router.post('/admin/impersonate/:userId', requireAdmin, AnalyticsController.impersonate)
router.get('/admin/users/search', requireAdmin, AnalyticsController.searchUsers)

export default router
