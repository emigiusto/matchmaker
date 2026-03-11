// whatsapp.controller.ts
// Webhook handler for incoming WhatsApp messages (provider-agnostic)

import { Request, Response, NextFunction } from 'express';
import { schedulingService } from '../scheduling/scheduling.service';
import { whatsappService } from './whatsapp.service';
import { logger } from '../../config/logger';

export class WhatsappController {
  static async webhook(req: Request, res: Response, next: NextFunction) {
    try {
      const body = req.body as Record<string, unknown>;
      const event = body?.event;
      logger.info('[WhatsApp] webhook hit', { event: event ?? 'unknown', hasData: !!body?.data });

      const parsed = whatsappService.parseWebhookPayload(req.body);

      if (!parsed) {
        if (event) {
          logger.warn('[WhatsApp] webhook not parsed', { event, dataKeys: body?.data ? Object.keys(body.data as object) : [] });
        }
        return res.status(200).json({ received: true, processed: false });
      }

      logger.info('[WhatsApp] webhook received', {
        from: parsed.senderPhone,
        text: parsed.messageText,
      });

      const { processed } = await schedulingService.handleCandidateResponse(
        parsed.senderPhone,
        parsed.messageText,
      );

      if (!processed) {
        logger.info('[WhatsApp] response not processed (no matching candidate or invalid)', {
          from: parsed.senderPhone,
          text: parsed.messageText,
        });
      }

      res.status(200).json({ received: true, processed });
    } catch (err) {
      next(err);
    }
  }
}
