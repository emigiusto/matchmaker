import { apiClient } from "./api-client"

export interface Friend {
  type: "user" | "guestContact"
  id: string
  name: string
  phone?: string
}

export const friendshipsService = {
  async listFriends(userId: string): Promise<Friend[]> {
    return apiClient.get<Friend[]>("/friendships", { userId })
  },

  async addUserFriend(userId: string, friendUserId: string) {
    return apiClient.post("/friendships/user", { userId, friendUserId })
  },

  async addGuestContactFriend(userId: string, guestContactId: string) {
    return apiClient.post("/friendships/guest", { userId, guestContactId })
  },
}
