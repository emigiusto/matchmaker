// groups.controller.ts
// HTTP layer for Groups (invite helpers, not permissions/clubs)
// Used by frontend for group management UI.

import { Request, Response, NextFunction } from 'express';
import * as GroupsService from './groups.service';
import { createGroupSchema, addGroupMemberSchema, removeGroupMemberSchema, groupIdParamSchema } from './groups.validators';

export class GroupsController {
  /**
   * POST /groups
   * Create a new group
   */
  static async createGroup(req: Request, res: Response, next: NextFunction) {
    try {
      const parsed = createGroupSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: 'Invalid request body', details: parsed.error.issues });
      }
      const { ownerUserId, name } = parsed.data;
      const group = await GroupsService.createGroup(ownerUserId, name);
      return res.status(201).json(group);
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /groups/:id/members
   * Add a member to a group
   */
  static async addMember(req: Request, res: Response, next: NextFunction) {
    try {
      const groupIdParam = req.params.id;
      const groupId = Array.isArray(groupIdParam) ? groupIdParam[0] : groupIdParam;
      const parsed = addGroupMemberSchema.safeParse({ groupId, ...req.body });
      if (!parsed.success) {
        return res.status(400).json({ error: 'Invalid input', details: parsed.error.issues });
      }
      const { userId } = parsed.data;
      const group = await GroupsService.addMember(groupId, userId);
      return res.status(200).json(group);
    } catch (error) {
      next(error);
    }
  }

  /**
   * DELETE /groups/:id/members/:userId
   * Remove a member from a group
   */
  static async removeMember(req: Request, res: Response, next: NextFunction) {
    try {
      const groupIdParam = req.params.id;
      const userIdParam = req.params.userId;
      const groupId = Array.isArray(groupIdParam) ? groupIdParam[0] : groupIdParam;
      const userId = Array.isArray(userIdParam) ? userIdParam[0] : userIdParam;
      const parsed = removeGroupMemberSchema.safeParse({ groupId, userId });
      if (!parsed.success) {
        return res.status(400).json({ error: 'Invalid input', details: parsed.error.issues });
      }
      const group = await GroupsService.removeMember(groupId, userId);
      return res.status(200).json(group);
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /groups?userId=
   * List groups for a user
   */
  static async listGroupsForUser(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = req.query.userId as string;
      if (!userId) {
        return res.status(400).json({ error: 'Missing userId query param' });
      }
      // Validate userId as UUID
      if (!/^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})$/.test(userId)) {
        return res.status(400).json({ error: 'Invalid userId' });
      }
      const groups = await GroupsService.listGroupsForUser(userId);
      return res.status(200).json(groups);
    } catch (error) {
      next(error);
    }
  }
}
