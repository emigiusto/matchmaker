// health.routes.ts
// Health stats at root path

import { Router } from 'express';
import { HealthController } from './health.controller';

const router = Router();

router.get('/', HealthController.index);
router.get('/health', HealthController.index);

export default router;
