// whatsapp.routes.ts
// Routes for WhatsApp webhook

import { Router } from 'express';
import { WhatsappController } from './whatsapp.controller';

const router = Router();

router.post('/webhook', WhatsappController.webhook);

export default router;
