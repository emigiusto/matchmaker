// whatsapp.controller.ts
// Webhook handler for incoming WhatsApp messages

import { Request, Response, NextFunction } from 'express';
import { schedulingService } from '../scheduling/scheduling.service';

export class WhatsappController {
  static async webhook(req: Request, res: Response, next: NextFunction) {
    try {
      const body = req.body;

      let senderPhone: string | undefined;
      let messageText: string | undefined;

      // Whapi format: { messages: [{ from, text: { body }, from_me }] }
      const msg = body.messages?.[0];
      if (msg && !msg.from_me && msg.type === 'text') {
        senderPhone = msg.from?.replace(/\D/g, '');
        messageText = msg.text?.body;
      }

      // Fallback: flat formats (simulation, other providers)
      if (!senderPhone) {
        if (body.sender?.phone) senderPhone = body.sender.phone;
        else if (body.from) senderPhone = String(body.from).replace(/\D/g, '');
        else if (body.contacts?.[0]?.wa_id) senderPhone = body.contacts[0].wa_id;
      }
      if (messageText === undefined) {
        if (body.body?.text) messageText = body.body.text;
        else if (body.text?.body) messageText = body.text.body;
        else if (typeof body.message === 'string') messageText = body.message;
      }

      if (!senderPhone || messageText === undefined) {
        return res.status(400).json({ error: 'Missing sender phone or message text' });
      }

      const { processed } = await schedulingService.handleCandidateResponse(senderPhone, messageText);

      res.status(200).json({ received: true, processed });
    } catch (err) {
      next(err);
    }
  }
}
