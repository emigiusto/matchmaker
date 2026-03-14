// guest-contacts.routes.ts
// Routes for manual name+phone contacts (I Want to Play flow)

import { Router } from 'express';
import { GuestContactsController } from './guest-contacts.controller';

const router = Router();

router.post('/', GuestContactsController.create);
router.post('/ensure-user', GuestContactsController.ensureUserByPhone);
router.get('/', GuestContactsController.listByOwner);
router.patch('/:id/socio-number', GuestContactsController.updateSocioNumber);

export default router;
