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
        locationText: body.locationText ?? "",
        radiusKm: body.radiusKm ?? null,
        hostPartnerUserId: body.hostPartnerUserId ?? null,
        candidateUserIds: body.candidateUserIds || [],
        bookingEnabled: body.bookingEnabled === true,
        timezone: body.timezone ?? 'UTC',
        additionalDates: Array.isArray(body.additionalDates) ? body.additionalDates : undefined,
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

  static async cancelContactedCandidate(req: Request, res: Response, next: NextFunction) {
    try {
      const requestId = typeof req.params.requestId === 'string' ? req.params.requestId : undefined;
      const candidateId = typeof req.params.candidateId === 'string' ? req.params.candidateId : undefined;
      const { userId } = req.body;
      if (!requestId || !candidateId) return res.status(400).json({ error: 'Missing requestId or candidateId' });
      if (!userId) return res.status(400).json({ error: 'Missing userId' });
      const request = await schedulingService.cancelContactedCandidate(requestId, candidateId, userId);
      res.json(request);
    } catch (err) {
      next(err);
    }
  }

  static async removeCandidate(req: Request, res: Response, next: NextFunction) {
    try {
      const requestId = typeof req.params.requestId === 'string' ? req.params.requestId : undefined;
      const candidateId = typeof req.params.candidateId === 'string' ? req.params.candidateId : undefined;
      const { userId } = req.body;
      if (!requestId || !candidateId) return res.status(400).json({ error: 'Missing requestId or candidateId' });
      if (!userId) return res.status(400).json({ error: 'Missing userId' });
      const request = await schedulingService.removeCandidate(requestId, candidateId, userId);
      res.json(request);
    } catch (err) {
      next(err);
    }
  }

  static async cancelAcceptedCandidate(req: Request, res: Response, next: NextFunction) {
    try {
      const requestId = typeof req.params.requestId === 'string' ? req.params.requestId : undefined;
      const candidateId = typeof req.params.candidateId === 'string' ? req.params.candidateId : undefined;
      const { userId } = req.body;
      if (!requestId || !candidateId) return res.status(400).json({ error: 'Missing requestId or candidateId' });
      if (!userId) return res.status(400).json({ error: 'Missing userId' });
      const request = await schedulingService.cancelAcceptedCandidate(requestId, candidateId, userId);
      res.json(request);
    } catch (err) {
      next(err);
    }
  }

  static async confirmMatch(req: Request, res: Response, next: NextFunction) {
    try {
      const requestId = typeof req.params.requestId === 'string' ? req.params.requestId : undefined;
      if (!requestId) return res.status(400).json({ error: 'Missing requestId' });
      const { userId, date, time, candidateIds } = req.body;
      if (!userId) return res.status(400).json({ error: 'Missing userId' });
      if (!date || typeof date !== 'string') return res.status(400).json({ error: 'Missing or invalid date (YYYY-MM-DD)' });
      if (!time || typeof time !== 'string') return res.status(400).json({ error: 'Missing or invalid time (HH:MM)' });
      if (!Array.isArray(candidateIds) || candidateIds.length === 0) return res.status(400).json({ error: 'Missing candidateIds' });
      const result = await schedulingService.confirmMatchOverride(requestId, userId, date, time, candidateIds);
      res.json(result);
    } catch (err) {
      next(err);
    }
  }

  static async retryCandidate(req: Request, res: Response, next: NextFunction) {
    try {
      const requestId = typeof req.params.requestId === 'string' ? req.params.requestId : undefined;
      const candidateId = typeof req.params.candidateId === 'string' ? req.params.candidateId : undefined;
      const { userId } = req.body;
      if (!requestId || !candidateId) return res.status(400).json({ error: 'Missing requestId or candidateId' });
      if (!userId) return res.status(400).json({ error: 'Missing userId' });
      const request = await schedulingService.retryCandidate(requestId, candidateId, userId);
      res.json(request);
    } catch (err) {
      next(err);
    }
  }

  static async addCandidates(req: Request, res: Response, next: NextFunction) {
    try {
      const requestId = typeof req.params.requestId === 'string' ? req.params.requestId : undefined;
      const { userId, candidateUserIds } = req.body;
      if (!requestId) return res.status(400).json({ error: 'Missing requestId' });
      if (!userId) return res.status(400).json({ error: 'Missing userId' });
      const ids = Array.isArray(candidateUserIds) ? candidateUserIds : [];
      const request = await schedulingService.addCandidates(requestId, ids, userId);
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

  static async debugDevUserCount(req: Request, res: Response, next: NextFunction) {
    try {
      if (process.env.ENVIRONMENT !== 'DEVELOPMENT') {
        return res.status(404).end();
      }
      const { prisma } = await import('../../prisma');
      const DEV_USER_ID = '023eddcc-c568-4091-8d7b-354a1744c7d4';
      const count = await prisma.schedulingRequest.count({ where: { hostUserId: DEV_USER_ID } });
      res.json({ hostUserId: DEV_USER_ID, schedulingRequestCount: count });
    } catch (err) {
      next(err);
    }
  }

  static async getCourtAvailability(req: Request, res: Response, next: NextFunction) {
    try {
      const requestId = typeof req.params.requestId === 'string' ? req.params.requestId : undefined;
      if (!requestId) return res.status(400).json({ error: 'Missing requestId' });
      const slots = await schedulingService.getCourtAvailability(requestId);
      res.json(slots);
    } catch (err) {
      next(err);
    }
  }

  static async getEventHistory(req: Request, res: Response, next: NextFunction) {
    try {
      const requestId = typeof req.params.requestId === 'string' ? req.params.requestId : undefined;
      if (!requestId) return res.status(400).json({ error: 'Missing requestId' });
      const events = await schedulingService.getEventHistory(requestId);
      res.json(events);
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

  static async getSchedulingRequestForJoin(req: Request, res: Response, next: NextFunction) {
    try {
      const token = typeof req.params.token === 'string' ? req.params.token : undefined;
      if (!token) return res.status(400).json({ error: 'Missing token' });
      const data = await schedulingService.getSchedulingRequestForJoin(token);
      if (!data) return res.status(404).json({ error: 'Invite not found' });
      res.json(data);
    } catch (err) {
      next(err);
    }
  }

  static async acceptViaLink(req: Request, res: Response, next: NextFunction) {
    try {
      const token = typeof req.params.token === 'string' ? req.params.token : undefined;
      if (!token) return res.status(400).json({ error: 'Missing token' });
      const { name, phone, email, socioNumber } = req.body;
      if (!name || typeof name !== 'string') return res.status(400).json({ error: 'Missing or invalid name' });
      if (!phone || typeof phone !== 'string') return res.status(400).json({ error: 'Missing or invalid phone' });
      const result = await schedulingService.acceptViaLink(token, {
        name,
        phone,
        email: typeof email === 'string' ? email : undefined,
        socioNumber: typeof socioNumber === 'string' ? socioNumber : undefined,
      });
      res.json(result);
    } catch (err) {
      next(err);
    }
  }

  static async checkQuorum(req: Request, res: Response, next: NextFunction) {
    try {
      const requestId = typeof req.params.requestId === 'string' ? req.params.requestId : undefined;
      const { userId } = req.body;
      if (!requestId) return res.status(400).json({ error: 'Missing requestId' });
      if (!userId) return res.status(400).json({ error: 'Missing userId' });
      const request = await schedulingService.getSchedulingRequestById(requestId);
      if (!request) return res.status(404).json({ error: 'Scheduling request not found' });
      if (request.hostUserId !== userId) return res.status(403).json({ error: 'Not authorized' });
      if (request.status !== 'active') return res.status(400).json({ error: 'Request is not active' });
      await schedulingService.checkPollQuorum(requestId);
      const updated = await schedulingService.getSchedulingRequestById(requestId);
      res.json(updated);
    } catch (err) {
      next(err);
    }
  }
}
