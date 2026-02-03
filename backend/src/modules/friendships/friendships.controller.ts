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

  /**
   * GET /friendships/:id
   * Get a specific friendship by ID
   */
  static async getFriendshipById(req: Request, res: Response, next: NextFunction) {
    try {
      const friendshipId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
      const friendship = await FriendshipsService.getFriendshipById(friendshipId);
      if (!friendship) return res.status(404).json({ error: 'Friendship not found' });
      res.json(friendship);
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /friendships/mutual?userId=...&otherUserId=...
   * List mutual friends between two users
   */
  static async listMutualFriends(req: Request, res: Response, next: NextFunction) {
    try {
      const { userId, otherUserId } = req.query as { userId: string; otherUserId: string };
      const friends = await FriendshipsService.listMutualFriends(userId, otherUserId);
      res.json(friends);
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /friendships/requests?userId=...
   * List incoming/outgoing friend requests (future extension)
   */
  static async listFriendRequests(req: Request, res: Response, next: NextFunction) {
    try {
      const { userId } = req.query as { userId: string };
      const requests = await FriendshipsService.listFriendRequests(userId);
      res.json(requests);
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /friendships/is-friend?userId=...&otherUserId=...
   * Check if two users are friends
   */
  static async isFriend(req: Request, res: Response, next: NextFunction) {
    try {
      const { userId, otherUserId } = req.query as { userId: string; otherUserId: string };
      const result = await FriendshipsService.isFriend(userId, otherUserId);
      res.json({ isFriend: result });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /friendships/count?userId=...
   * Get friend count for a user
   */
  static async countFriends(req: Request, res: Response, next: NextFunction) {
    try {
      const { userId } = req.query as { userId: string };
      const count = await FriendshipsService.countFriends(userId);
      res.json({ count });
    } catch (error) {
      next(error);
    }
  }
}
