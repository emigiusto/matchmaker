// messages.controller.ts
// HTTP layer for chat messages (frontend: send and fetch messages)

import { Request, Response, NextFunction } from 'express';
import * as MessagesService from './messages.service';
import { createMessageSchema } from '../conversations/chat.validators';

export class MessagesController {
  /**
   * POST /messages
   * Send a new message
   */
  static async createMessage(req: Request, res: Response, next: NextFunction) {
    try {
      const parsed = createMessageSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: 'Invalid request body', details: parsed.error.issues });
      }
      const { conversationId, senderUserId, content } = parsed.data;
      const message = await MessagesService.createMessage(conversationId, senderUserId, content);
      return res.status(201).json(message);
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /messages?conversationId=
   * List messages for a conversation
   */
  static async listMessages(req: Request, res: Response, next: NextFunction) {
    try {
      const conversationId = req.query.conversationId as string;
      if (!conversationId) {
        return res.status(400).json({ error: 'Missing conversationId query param' });
      }
      // Validate conversationId as UUID
      if (!/^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})$/.test(conversationId)) {
        return res.status(400).json({ error: 'Invalid conversationId' });
      }
      const messages = await MessagesService.listMessages(conversationId);
      return res.status(200).json(messages);
    } catch (error) {
      next(error);
    }
  }
}
