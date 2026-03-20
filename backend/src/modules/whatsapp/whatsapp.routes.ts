// whatsapp.routes.ts
// Routes for WhatsApp webhook

import { Router } from 'express';
import { WhatsappController } from './whatsapp.controller';
import { verifyWebhookSignature } from './webhook-signature.middleware';

const router = Router();

router.post('/webhook', verifyWebhookSignature, WhatsappController.webhook);

export default router;
