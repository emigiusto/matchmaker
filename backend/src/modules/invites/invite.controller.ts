// invite.controller.ts
// --------------------
// HTTP layer for Invite endpoints
// Maps HTTP requests to InviteService methods. No business logic here.

import { Request, Response, NextFunction } from 'express';
import { InviteService } from './invite.service';
import {
  createInviteSchema,
  inviteTokenParamSchema,
  confirmInviteSchema,
  declineInviteSchema,
} from './invite.validators';

// Expected frontend flows:
// - POST /invites: User creates an invite for an availability
// - GET /invites/:token: Fetch invite details (for confirmation/decline page)
// - POST /invites/:token/confirm: Confirm invite via link (token)
// - POST /invites/:token/decline: Decline invite via link (token)

export class InviteController {
  /**
   * POST /invites
   * Create a new invite
   */
  static async createInvite(req: Request, res: Response, next: NextFunction) {
    try {
      const parsed = createInviteSchema.parse(req.body);
      const invite = await InviteService.createInvite(parsed.inviterUserId, parsed.availabilityId);
      res.status(201).json(invite);
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /invites/:token
   * Fetch invite details by token
   */
  static async getInviteByToken(req: Request, res: Response, next: NextFunction) {
    try {
      const { token } = inviteTokenParamSchema.parse(req.params);
      const invite = await InviteService.getInviteByToken(token);
      res.status(200).json(invite);
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /invites/:token/confirm
   * Confirm invite by token (link-based)
   */
  static async confirmInvite(req: Request, res: Response, next: NextFunction) {
    try {
      const { token } = inviteTokenParamSchema.parse(req.params);
      confirmInviteSchema.parse(req.body); // body must be empty
      const invite = await InviteService.confirmInvite(token);
      res.status(200).json(invite);
    } catch (error: any) {
      if (error.status === 409 || error.status === 410) {
        res.status(error.status).json({ error: error.message });
      } else {
        next(error);
      }
    }
  }

  /**
   * POST /invites/:token/decline
   * Decline invite by token (link-based)
   */
  static async declineInvite(req: Request, res: Response, next: NextFunction) {
    try {
      const { token } = inviteTokenParamSchema.parse(req.params);
      declineInviteSchema.parse(req.body); // body must be empty
      const invite = await InviteService.declineInvite(token);
      res.status(200).json(invite);
    } catch (error: any) {
      if (error.status === 409 || error.status === 410) {
        res.status(error.status).json({ error: error.message });
      } else {
        next(error);
      }
    }
  }
}
