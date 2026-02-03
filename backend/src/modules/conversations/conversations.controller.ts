// conversations.controller.ts
// HTTP layer for chat conversations (frontend: fetch or create chat context)

import { Request, Response, NextFunction } from 'express';
import * as ConversationsService from './conversations.service';
import { conversationIdParamSchema } from './chat.validators';

export class ConversationsController {
  /**
   * GET /conversations/:id
   * Fetch a conversation by ID
   */
  static async getConversationById(req: Request, res: Response, next: NextFunction) {
    try {
      const parsed = conversationIdParamSchema.safeParse(req.params);
      if (!parsed.success) {
        return res.status(400).json({ error: 'Invalid conversation id', details: parsed.error.issues });
      }
      const conversation = await ConversationsService.getConversationById(parsed.data.id);
      return res.status(200).json(conversation);
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /conversations
   * Create a new conversation (direct, group, or match)
   * For match: pass type='match' and matchId in body
   * For direct/group: pass type only
   */
  static async createConversation(req: Request, res: Response, next: NextFunction) {
    try {
      const { type, matchId } = req.body;
      if (!['direct', 'group', 'match'].includes(type)) {
        return res.status(400).json({ error: 'Invalid conversation type' });
      }
      if (type === 'match') {
        // Validate matchId as UUID
        if (!matchId || !/^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})$/.test(matchId)) {
          return res.status(400).json({ error: 'Invalid or missing matchId' });
        }
      }
      const conversation = await ConversationsService.createConversation(type, matchId);
      return res.status(201).json(conversation);
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /conversations/match/:matchId
   * (Legacy) Get or create a conversation for a match
   * Kept for backward compatibility; prefer POST /conversations
   */
  static async getOrCreateConversationForMatch(req: Request, res: Response, next: NextFunction) {
    try {
      let { matchId } = req.params;
      if (Array.isArray(matchId)) matchId = matchId[0];
      if (!/^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})$/.test(matchId)) {
        return res.status(400).json({ error: 'Invalid matchId' });
      }
      const conversation = await ConversationsService.createConversation('match', matchId);
      return res.status(201).json(conversation);
    } catch (error) {
      next(error);
    }
  }
}
