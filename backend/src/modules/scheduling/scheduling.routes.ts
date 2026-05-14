// scheduling.routes.ts
// Routes for scheduling automation

import { Router } from 'express';
import { SchedulingController } from './scheduling.controller';

const router = Router();

// GET / must be before parametric routes so ?hostUserId=... is matched
router.get('/', SchedulingController.listSchedulingRequests);

router.post('/', SchedulingController.createSchedulingRequest);
router.get('/active-count', SchedulingController.getActiveCount);
router.get('/_debug-dev-user', SchedulingController.debugDevUserCount);
router.get('/incoming', SchedulingController.listIncomingInvites);
router.get('/by-token/:token', SchedulingController.getSchedulingRequestByToken);

// Public join routes — must come before /:requestId to avoid conflict
router.get('/join/:token', SchedulingController.getSchedulingRequestForJoin);
router.post('/join/:token/accept', SchedulingController.acceptViaLink);
router.get('/:requestId/invite-link', SchedulingController.getInviteLink);
router.get('/:requestId/events', SchedulingController.getEventHistory);
router.get('/:requestId', SchedulingController.getSchedulingRequest);
router.post('/:requestId/start', SchedulingController.startScheduling);
router.post('/:requestId/accept/:candidateId', SchedulingController.manualAcceptCandidate);
router.post('/:requestId/cancel-accepted/:candidateId', SchedulingController.cancelAcceptedCandidate);
router.post('/:requestId/cancel-contacted/:candidateId', SchedulingController.cancelContactedCandidate);
router.post('/:requestId/remove/:candidateId', SchedulingController.removeCandidate);
router.post('/:requestId/retry/:candidateId', SchedulingController.retryCandidate);
router.post('/:requestId/candidates', SchedulingController.addCandidates);
router.post('/:requestId/check-quorum', SchedulingController.checkQuorum);
router.post('/:requestId/cancel', SchedulingController.cancelSchedulingRequest);

export default router;
