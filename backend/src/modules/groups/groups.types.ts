// groups.types.ts
// API-facing types for the Groups module

/**
 * GroupDTO: API-facing group object
 * Groups are invite helpers, not permissions or clubs.
 */
export interface GroupDTO {
  id: string;
  name: string;
  ownerUserId: string;
  memberUserIds: string[];
  createdAt: string;
}

/**
 * Input for creating a new group
 */
export interface CreateGroupInput {
  name: string;
  ownerUserId: string;
}

/**
 * Input for adding a member to a group
 */
export interface AddGroupMemberInput {
  groupId: string;
  userId: string;
}
