// scheduling.controller.ts
// HTTP layer for scheduling automation

import { Request, Response, NextFunction } from 'express';
import { schedulingService } from './scheduling.service';

export class SchedulingController {
  static async createSchedulingRequest(req: Request, res: Response, next: NextFunction) {
    try {
      const body = req.body;
      const input = {
        hostUserId: body.hostUserId,
        sportType: body.sportType,
        format: body.format,
        matchType: body.matchType,
        date: body.date,
        startTime: body.startTime,
        endTime: body.endTime,
        locationText: body.locationText,
        radiusKm: body.radiusKm ?? null,
        responseWindowMinutes: body.responseWindowMinutes,
        hostPartnerUserId: body.hostPartnerUserId ?? null,
        candidateUserIds: body.candidateUserIds || [],
      };
      const request = await schedulingService.createSchedulingRequest(input);
      res.status(201).json(request);
    } catch (err) {
      next(err);
    }
  }

  static async startScheduling(req: Request, res: Response, next: NextFunction) {
    try {
      const requestId = typeof req.params.requestId === 'string' ? req.params.requestId : undefined;
      if (!requestId) return res.status(400).json({ error: 'Missing requestId' });
      const request = await schedulingService.startScheduling(requestId);
      if (!request) return res.status(404).json({ error: 'Scheduling request not found or not active' });
      res.json(request);
    } catch (err) {
      next(err);
    }
  }

  static async pauseSchedulingRequest(req: Request, res: Response, next: NextFunction) {
    try {
      const requestId = typeof req.params.requestId === 'string' ? req.params.requestId : undefined;
      const { userId } = req.body;
      if (!requestId) return res.status(400).json({ error: 'Missing requestId' });
      if (!userId) return res.status(400).json({ error: 'Missing userId' });
      const request = await schedulingService.pauseSchedulingRequest(requestId, userId);
      res.json(request);
    } catch (err) {
      next(err);
    }
  }

  static async resumeSchedulingRequest(req: Request, res: Response, next: NextFunction) {
    try {
      const requestId = typeof req.params.requestId === 'string' ? req.params.requestId : undefined;
      const { userId } = req.body;
      if (!requestId) return res.status(400).json({ error: 'Missing requestId' });
      if (!userId) return res.status(400).json({ error: 'Missing userId' });
      const request = await schedulingService.resumeSchedulingRequest(requestId, userId);
      res.json(request);
    } catch (err) {
      next(err);
    }
  }

  static async cancelSchedulingRequest(req: Request, res: Response, next: NextFunction) {
    try {
      const requestId = typeof req.params.requestId === 'string' ? req.params.requestId : undefined;
      const { userId } = req.body;
      if (!requestId) return res.status(400).json({ error: 'Missing requestId' });
      if (!userId) return res.status(400).json({ error: 'Missing userId' });
      const request = await schedulingService.cancelSchedulingRequest(requestId, userId);
      res.json(request);
    } catch (err) {
      next(err);
    }
  }

  static async getInviteLink(req: Request, res: Response, next: NextFunction) {
    try {
      const requestId = typeof req.params.requestId === 'string' ? req.params.requestId : undefined;
      const baseUrl = typeof req.query.baseUrl === 'string' ? req.query.baseUrl : undefined;
      if (!requestId) return res.status(400).json({ error: 'Missing requestId' });
      const link = await schedulingService.getInviteLink(requestId, baseUrl);
      res.json({ inviteLink: link });
    } catch (err) {
      next(err);
    }
  }

  static async getActiveCount(req: Request, res: Response, next: NextFunction) {
    try {
      const hostUserId = typeof req.query.hostUserId === 'string' ? req.query.hostUserId : undefined;
      if (!hostUserId) return res.status(400).json({ error: 'Missing hostUserId' });
      const result = await schedulingService.getActiveCount(hostUserId);
      res.json(result);
    } catch (err) {
      next(err);
    }
  }

  static async getSchedulingRequest(req: Request, res: Response, next: NextFunction) {
    try {
      const requestId = typeof req.params.requestId === 'string' ? req.params.requestId : undefined;
      if (!requestId) return res.status(400).json({ error: 'Missing requestId' });
      const request = await schedulingService.getSchedulingRequestById(requestId);
      if (!request) return res.status(404).json({ error: 'Scheduling request not found' });
      res.json(request);
    } catch (err) {
      next(err);
    }
  }

  static async getSchedulingRequestByToken(req: Request, res: Response, next: NextFunction) {
    try {
      const token = typeof req.params.token === 'string' ? req.params.token : undefined;
      if (!token) return res.status(400).json({ error: 'Missing token' });
      const request = await schedulingService.getSchedulingRequestByToken(token);
      if (!request) return res.status(404).json({ error: 'Scheduling request not found' });
      res.json(request);
    } catch (err) {
      next(err);
    }
  }

  static async listSchedulingRequests(req: Request, res: Response, next: NextFunction) {
    try {
      const hostUserId = typeof req.query.hostUserId === 'string' ? req.query.hostUserId : undefined;
      if (!hostUserId) return res.status(400).json({ error: 'Missing or invalid hostUserId' });
      const requests = await schedulingService.listSchedulingRequestsByHost(hostUserId);
      res.json(requests);
    } catch (err) {
      next(err);
    }
  }

  static async listIncomingInvites(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = typeof req.query.userId === 'string' ? req.query.userId : undefined;
      if (!userId) return res.status(400).json({ error: 'Missing or invalid userId' });
      const requests = await schedulingService.listIncomingInvites(userId);
      res.json(requests);
    } catch (err) {
      next(err);
    }
  }
}
