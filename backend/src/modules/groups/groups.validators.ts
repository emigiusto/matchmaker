// groups.validators.ts
// Zod validators for the Groups module

import { z } from 'zod';

export const createGroupSchema = z.object({
  name: z.string().min(1, 'Group name is required'),
  ownerUserId: z.string().uuid('Invalid ownerUserId'),
});

export const addGroupMemberSchema = z.object({
  groupId: z.string().uuid('Invalid groupId'),
  userId: z.string().uuid('Invalid userId'),
  // Prevent adding same member twice (enforced in service, hint here)
});

export const removeGroupMemberSchema = z.object({
  groupId: z.string().uuid('Invalid groupId'),
  userId: z.string().uuid('Invalid userId'),
});

export const groupIdParamSchema = z.object({
  id: z.string().uuid('Invalid groupId'),
});

// TODO: Add role support for group members in the future
