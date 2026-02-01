// friendships.controller.ts
// -------------------------
// HTTP layer for Friendships endpoints
// Maps HTTP requests to FriendshipsService methods. No business logic here.

import { Request, Response, NextFunction } from 'express';
import { FriendshipsService } from './friendships.service';
import {
  addUserFriendSchema,
  addGuestContactFriendSchema,
  friendshipIdParamSchema,
  listFriendsQuerySchema,
} from './friendships.validators';

// Expected usage from frontend:
// - POST /friendships/user: Add a registered user as a friend
// - POST /friendships/guest: Add a guest contact as a friend
// - DELETE /friendships/:id: Remove a friendship
// - GET /friendships?userId=: List all friends for a user

export class FriendshipsController {
  /**
   * POST /friendships/user
   * Add a registered user as a friend
   */
  static async addUserFriend(req: Request, res: Response, next: NextFunction) {
    try {
      const parsed = addUserFriendSchema.parse(req.body);
      const friendship = await FriendshipsService.addUserFriend(parsed.userId, parsed.friendUserId);
      res.status(201).json(friendship);
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /friendships/guest
   * Add a guest contact as a friend
   */
  static async addGuestContactFriend(req: Request, res: Response, next: NextFunction) {
    try {
      const parsed = addGuestContactFriendSchema.parse(req.body);
      const friendship = await FriendshipsService.addGuestContactFriend(parsed.userId, parsed.guestContactId);
      res.status(201).json(friendship);
    } catch (error) {
      next(error);
    }
  }

  /**
   * DELETE /friendships/:id
   * Remove a friendship by ID
   */
  static async removeFriend(req: Request, res: Response, next: NextFunction) {
    try {
      const { friendshipId } = friendshipIdParamSchema.parse({ friendshipId: req.params.id });
      await FriendshipsService.removeFriend(friendshipId);
      res.status(204).send();
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /friendships?userId=
   * List all friends for a user
   */
  static async listFriends(req: Request, res: Response, next: NextFunction) {
    try {
      const parsed = listFriendsQuerySchema.parse(req.query);
      const friends = await FriendshipsService.listFriends(parsed.userId);
      res.json(friends);
    } catch (error) {
      next(error);
    }
  }
}
