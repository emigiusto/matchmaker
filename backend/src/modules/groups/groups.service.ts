// groups.service.ts
// Service layer for Groups (simple invite helpers, not permissions/clubs)
// GuestContacts are excluded by design.

import { AppError } from '../../shared/errors/AppError';
import { prisma } from '../../shared/prisma';
import { GroupDTO } from './groups.types';

/**
 * Converts a Group and its members to GroupDTO
 */
function toGroupDTO(group: any, members: any[]): GroupDTO {
  return {
    id: group.id,
    name: group.name,
    ownerUserId: group.ownerUserId,
    memberUserIds: members.map((m) => m.userId),
    createdAt: group.createdAt.toISOString(),
  };
}

/**
 * Create a new group. Owner is always a member.
 */
export async function createGroup(ownerUserId: string, name: string): Promise<GroupDTO> {
  // Only allow real users
  const user = await prisma.user.findUnique({ where: { id: ownerUserId } });
  if (!user) throw new AppError('Owner user not found', 404);
  const group = await prisma.group.create({
    data: {
      name,
      ownerUserId,
      members: {
        create: [{ userId: ownerUserId }], // Owner is a member
      },
    },
    include: { members: true },
  });
  return toGroupDTO(group, group.members);
}

/**
 * Add a member to a group. No duplicates. Only users allowed.
 */
export async function addMember(groupId: string, userId: string): Promise<GroupDTO> {
  const group = await prisma.group.findUnique({
    where: { id: groupId },
    include: { members: true },
  });
  if (!group) throw new AppError('Group not found', 404);
  if (group.members.some((m) => m.userId === userId)) {
    throw new AppError('User is already a member', 400);
  }
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new AppError('User not found', 404);
  await prisma.groupMember.create({ data: { groupId, userId } });
  const updated = await prisma.group.findUnique({ where: { id: groupId }, include: { members: true } });
  if (!updated) throw new AppError('Group not found after update', 404);
  return toGroupDTO(updated, updated.members);
}

/**
 * Remove a member from a group. Owner cannot be removed.
 */
export async function removeMember(groupId: string, userId: string): Promise<GroupDTO> {
  const group = await prisma.group.findUnique({
    where: { id: groupId },
    include: { members: true },
  });
  if (!group) throw new AppError('Group not found', 404);
  if (group.ownerUserId === userId) {
    throw new AppError('Cannot remove group owner', 400);
  }
  if (!group.members.some((m) => m.userId === userId)) {
    throw new AppError('User is not a member', 404);
  }
  await prisma.groupMember.delete({ where: { groupId_userId: { groupId, userId } } });
  const updated = await prisma.group.findUnique({ where: { id: groupId }, include: { members: true } });
  if (!updated) throw new AppError('Group not found after update', 404);
  return toGroupDTO(updated, updated.members);
}

/**
 * List all groups for a user (as member).
 * Membership queries are efficient (indexed).
 */
export async function listGroupsForUser(userId: string): Promise<GroupDTO[]> {
  const memberships = await prisma.groupMember.findMany({
    where: { userId },
    include: { group: { include: { members: true } } },
  });
  return memberships.map((m) => toGroupDTO(m.group, m.group.members));
}

// Defensive: No GuestContacts, no hidden permissions, owner always a member.
