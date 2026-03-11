import { apiClient } from "./api-client"

export interface GroupDTO {
  id: string
  name: string
  ownerUserId: string
  memberUserIds: string[]
  createdAt: string
}

export interface GroupWithMembersDTO extends GroupDTO {
  members: { id: string; name: string; phone: string | null }[]
}

export const groupsService = {
  async listWithMembers(userId: string): Promise<GroupWithMembersDTO[]> {
    return apiClient.get<GroupWithMembersDTO[]>("/groups", {
      userId,
      withMembers: "1",
    })
  },
}
