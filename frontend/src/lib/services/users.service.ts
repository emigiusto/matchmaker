import { apiClient } from "./api-client"

export interface User {
  id: string
  email?: string
  name?: string
  playerId?: string
  phone?: string
}

export const usersService = {
  async getAll(): Promise<User[]> {
    return apiClient.get<User[]>("/users")
  },

  async getById(userId: string): Promise<User> {
    return apiClient.get<User>(`/users/${userId}`)
  },

  async getCurrent(): Promise<User> {
    return apiClient.get<User>("/users/me")
  },
}
