// reminders.routes.ts

import { Router } from 'express';
import { RemindersController } from './reminders.controller';

const router = Router();

router.post('/', RemindersController.create);
router.get('/', RemindersController.listByUser);

export default router;
