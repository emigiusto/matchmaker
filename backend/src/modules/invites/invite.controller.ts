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
  cancelInviteSchema
} from './invite.validators';
import { CreateInviteInput } from './invite.types';

// Expected frontend flows:
// - POST /invites: User creates an invite for an availability
// - GET /invites/:token: Fetch invite details (for confirmation/decline page)
// - POST /invites/:token/confirm: Confirm invite via link (token)
// - POST /invites/:token/decline: Decline invite via link (token)

export class InviteController {
  /**
   * GET /invites/by-id/:id
   * Get invite by ID
   */
  static async getInviteById(req: Request, res: Response, next: NextFunction) {
    try {
      const idParam = req.params.id;
      const id = Array.isArray(idParam) ? idParam[0] : idParam;
      const invite = await InviteService.getInviteById(id);
      if (!invite) return res.status(404).json({ error: 'Invite not found' });
      res.status(200).json(invite);
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /invites/by-user/:userId
   * List all invites sent or received by a user
   */
  static async listInvitesByUser(req: Request, res: Response, next: NextFunction) {
    try {
      const userIdParam = req.params.userId;
      const userId = Array.isArray(userIdParam) ? userIdParam[0] : userIdParam;
      const invites = await InviteService.listInvitesByUser(userId);
      res.status(200).json(invites);
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /invites/by-availability/:availabilityId
   * List all invites for an availability
   */
  static async listInvitesByAvailability(req: Request, res: Response, next: NextFunction) {
    try {
      const availabilityIdParam = req.params.availabilityId;
      const availabilityId = Array.isArray(availabilityIdParam) ? availabilityIdParam[0] : availabilityIdParam;
      const invites = await InviteService.listInvitesByAvailability(availabilityId);
      res.status(200).json(invites);
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /invites/count/:userId
   * Count invites for a user
   */
  static async countInvitesByUser(req: Request, res: Response, next: NextFunction) {
    try {
      const userIdParam = req.params.userId;
      const userId = Array.isArray(userIdParam) ? userIdParam[0] : userIdParam;
      const count = await InviteService.countInvitesByUser(userId);
      res.status(200).json({ userId, count });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /invites
   * Create a new invite
   */
  static async createInvite(req: Request, res: Response, next: NextFunction) {
    try {
      const parsed = createInviteSchema.parse(req.body);
      const createInviteInput: CreateInviteInput = { availabilityId: parsed.availabilityId, inviterUserId: parsed.inviterUserId, };
      const invite = await InviteService.createInvite(createInviteInput);
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
      const { acceptorUserId } = confirmInviteSchema.parse(req.body);
      if (!acceptorUserId) {
        return res.status(400).json({ error: 'acceptorUserId is required' });
      }
      const invite = await InviteService.confirmInvite(token, acceptorUserId);
      res.status(200).json(invite);
    } catch (error: unknown) {
      if (
        typeof error === 'object' && error !== null && 'status' in error &&
        ((error as { status?: number }).status === 409 || (error as { status?: number }).status === 410)
      ) {
        res.status((error as { status: number }).status).json({ error: (error as { message?: string }).message });
      } else {
        next(error);
      }
    }
  }

  /**
 * POST /invites/:id/cancel
 * Cancel invite by ID (inviter only)
 */
  static async cancelInvite(req: Request, res: Response, next: NextFunction) {
    try {
      const idParam = req.params.id;
      const id = Array.isArray(idParam) ? idParam[0] : idParam;
      const { userId } = cancelInviteSchema.parse(req.body);
      const invite = await InviteService.cancelInvite(id, userId);
      res.status(200).json(invite);
    } catch (error) {
      if (
        typeof error === 'object' && error !== null && 'status' in error &&
        ((error as { status?: number }).status === 403 || (error as { status?: number }).status === 409)
      ) {
        res.status((error as { status: number }).status).json({ error: (error as { message?: string }).message });
      } else {
        next(error);
      }
    }
  }
}
