// whatsapp.controller.ts
// Webhook handler for incoming WhatsApp messages (provider-agnostic)

import { Request, Response, NextFunction } from 'express';
import { schedulingService } from '../scheduling/scheduling.service';
import { whatsappService } from './whatsapp.service';
import { logger } from '../../config/logger';

export class WhatsappController {
  static async webhook(req: Request, res: Response, next: NextFunction) {
    try {
      const parsed = whatsappService.parseWebhookPayload(req.body);

      if (!parsed) {
        return res.status(200).json({ received: true, processed: false });
      }

      logger.info('[WhatsApp] invite response', {
        from: parsed.senderPhone,
        text: parsed.messageText,
        votedOptions: parsed.votedOptions,
      });

      const { processed } = await schedulingService.handleCandidateResponse(
        parsed.senderPhone,
        parsed.messageText,
        parsed.votedOptions,
      );

      res.status(200).json({ received: true, processed });
    } catch (err) {
      next(err);
    }
  }
}
