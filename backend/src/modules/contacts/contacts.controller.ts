// contacts.controller.ts

import { Request, Response, NextFunction } from 'express';
import * as ContactsService from './contacts.service';
import {
  createContactSchema,
  updateContactSchema,
  createContactListSchema,
  renameContactListSchema,
  addListMemberSchema,
} from './contacts.validators';

/** Extract a single string from a query param (handles string | string[] union) */
const qs = (req: Request, key: string): string =>
  String((Array.isArray(req.query[key]) ? (req.query[key] as string[])[0] : req.query[key]) ?? '');

export class ContactsController {
  // ─── Contacts ─────────────────────────────────────────────

  static async create(req: Request, res: Response, next: NextFunction) {
    try {
      const parsed = createContactSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: 'Invalid request body', details: parsed.error.issues });
      const result = await ContactsService.createContact(parsed.data);
      return res.status(201).json(result);
    } catch (err) { next(err); }
  }

  static async list(req: Request, res: Response, next: NextFunction) {
    try {
      const ownerUserId = qs(req, 'ownerUserId');
      if (!ownerUserId) return res.status(400).json({ error: 'Missing ownerUserId query param' });
      const contacts = await ContactsService.listContacts(ownerUserId);
      return res.json(contacts);
    } catch (err) { next(err); }
  }

  static async update(req: Request, res: Response, next: NextFunction) {
    try {
      const id = String(req.params.id);
      const ownerUserId = String(req.body.ownerUserId ?? '');
      if (!ownerUserId) return res.status(400).json({ error: 'Missing ownerUserId' });
      const parsed = updateContactSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: 'Invalid request body', details: parsed.error.issues });
      const contact = await ContactsService.updateContact(id, ownerUserId, parsed.data);
      return res.json(contact);
    } catch (err) { next(err); }
  }

  static async remove(req: Request, res: Response, next: NextFunction) {
    try {
      const id = String(req.params.id);
      const ownerUserId = qs(req, 'ownerUserId');
      if (!ownerUserId) return res.status(400).json({ error: 'Missing ownerUserId query param' });
      await ContactsService.deleteContact(id, ownerUserId);
      return res.status(204).send();
    } catch (err) { next(err); }
  }

  // ─── Contact Lists ─────────────────────────────────────────

  static async createList(req: Request, res: Response, next: NextFunction) {
    try {
      const parsed = createContactListSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: 'Invalid request body', details: parsed.error.issues });
      const list = await ContactsService.createContactList(parsed.data.ownerUserId, parsed.data.name);
      return res.status(201).json(list);
    } catch (err) { next(err); }
  }

  static async listLists(req: Request, res: Response, next: NextFunction) {
    try {
      const ownerUserId = qs(req, 'ownerUserId');
      if (!ownerUserId) return res.status(400).json({ error: 'Missing ownerUserId query param' });
      const lists = await ContactsService.listContactLists(ownerUserId);
      return res.json(lists);
    } catch (err) { next(err); }
  }

  static async renameList(req: Request, res: Response, next: NextFunction) {
    try {
      const id = String(req.params.id);
      const ownerUserId = String(req.body.ownerUserId ?? '');
      if (!ownerUserId) return res.status(400).json({ error: 'Missing ownerUserId' });
      const parsed = renameContactListSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: 'Invalid request body', details: parsed.error.issues });
      const list = await ContactsService.renameContactList(id, ownerUserId, parsed.data.name);
      return res.json(list);
    } catch (err) { next(err); }
  }

  static async deleteList(req: Request, res: Response, next: NextFunction) {
    try {
      const id = String(req.params.id);
      const ownerUserId = qs(req, 'ownerUserId');
      if (!ownerUserId) return res.status(400).json({ error: 'Missing ownerUserId query param' });
      await ContactsService.deleteContactList(id, ownerUserId);
      return res.status(204).send();
    } catch (err) { next(err); }
  }

  static async addMember(req: Request, res: Response, next: NextFunction) {
    try {
      const listId = String(req.params.id);
      const ownerUserId = String(req.body.ownerUserId ?? '');
      if (!ownerUserId) return res.status(400).json({ error: 'Missing ownerUserId' });
      const parsed = addListMemberSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: 'Invalid request body', details: parsed.error.issues });
      const list = await ContactsService.addMemberToList(listId, parsed.data.contactId, ownerUserId);
      return res.json(list);
    } catch (err) { next(err); }
  }

  static async removeMember(req: Request, res: Response, next: NextFunction) {
    try {
      const listId = String(req.params.id);
      const contactId = String(req.params.contactId);
      const ownerUserId = qs(req, 'ownerUserId');
      if (!ownerUserId) return res.status(400).json({ error: 'Missing ownerUserId query param' });
      await ContactsService.removeMemberFromList(listId, contactId, ownerUserId);
      return res.status(204).send();
    } catch (err) { next(err); }
  }
}
