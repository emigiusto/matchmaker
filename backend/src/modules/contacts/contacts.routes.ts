// contacts.routes.ts

import { Router } from 'express';
import { ContactsController } from './contacts.controller';

const router = Router();

// Contacts
router.post('/', ContactsController.create);
router.get('/', ContactsController.list);
router.patch('/:id', ContactsController.update);
router.delete('/:id', ContactsController.remove);

// Contact Lists
router.post('/lists', ContactsController.createList);
router.get('/lists', ContactsController.listLists);
router.patch('/lists/:id', ContactsController.renameList);
router.delete('/lists/:id', ContactsController.deleteList);
router.post('/lists/:id/members', ContactsController.addMember);
router.delete('/lists/:id/members/:contactId', ContactsController.removeMember);
router.put('/lists/:id/members/order', ContactsController.reorderMembers);

export default router;
