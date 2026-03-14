// guest-contacts.controller.ts
// HTTP layer for manual name+phone contacts

import { Request, Response, NextFunction } from 'express';
import * as GuestContactsService from './guest-contacts.service';
import { createGuestContactSchema, ensureUserByPhoneSchema } from './guest-contacts.validators';

export class GuestContactsController {
  static async create(req: Request, res: Response, next: NextFunction) {
    try {
      const parsed = createGuestContactSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: 'Invalid request body', details: parsed.error.issues });
      }
      const contact = await GuestContactsService.createGuestContact(parsed.data);
      return res.status(201).json(contact);
    } catch (err) {
      next(err);
    }
  }

  static async ensureUserByPhone(req: Request, res: Response, next: NextFunction) {
    try {
      const parsed = ensureUserByPhoneSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: 'Invalid request body', details: parsed.error.issues });
      }
      const result = await GuestContactsService.ensureUserByPhone(parsed.data.phone, parsed.data.name);
      return res.json(result);
    } catch (err) {
      next(err);
    }
  }

  static async listByOwner(req: Request, res: Response, next: NextFunction) {
    try {
      const ownerUserId = req.query.ownerUserId as string;
      if (!ownerUserId) {
        return res.status(400).json({ error: 'Missing ownerUserId query param' });
      }
      const contacts = await GuestContactsService.listGuestContactsByOwner(ownerUserId);
      return res.json(contacts);
    } catch (err) {
      next(err);
    }
  }

  static async updateSocioNumber(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const { ownerUserId, socioNumber } = req.body;
      if (!ownerUserId || typeof socioNumber !== 'string') {
        return res.status(400).json({ error: 'Missing ownerUserId or socioNumber' });
      }
      const contact = await GuestContactsService.updateGuestContactSocioNumber(id, ownerUserId, socioNumber);
      return res.json(contact);
    } catch (err) {
      next(err);
    }
  }
}
