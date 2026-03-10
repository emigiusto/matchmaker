// scheduling.routes.ts
// Routes for scheduling automation

import { Router } from 'express';
import { SchedulingController } from './scheduling.controller';

const router = Router();

router.post('/', SchedulingController.createSchedulingRequest);
router.get('/active-count', SchedulingController.getActiveCount);
router.get('/incoming', SchedulingController.listIncomingInvites);
router.get('/by-token/:token', SchedulingController.getSchedulingRequestByToken);
router.get('/:requestId/invite-link', SchedulingController.getInviteLink);
router.get('/:requestId', SchedulingController.getSchedulingRequest);
router.get('/', SchedulingController.listSchedulingRequests);
router.post('/:requestId/start', SchedulingController.startScheduling);
router.post('/:requestId/pause', SchedulingController.pauseSchedulingRequest);
router.post('/:requestId/resume', SchedulingController.resumeSchedulingRequest);
router.post('/:requestId/cancel', SchedulingController.cancelSchedulingRequest);

export default router;
