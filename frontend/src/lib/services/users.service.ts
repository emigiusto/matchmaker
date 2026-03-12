import { apiClient } from "./api-client"

export interface User {
  id: string
  email?: string
  name?: string
  playerId?: string
  phone?: string
}

export interface UpdateUserInput {
  name?: string
  /** Pass null to clear phone */
  phone?: string | null
}

export interface ProfileResponse {
  user: User
  player: { id: string; displayName?: string; defaultCity?: string; preferredClub?: string } | null
}

export const usersService = {
  async getAll(): Promise<User[]> {
    return apiClient.get<User[]>("/users")
  },

  async getById(userId: string): Promise<User> {
    return apiClient.get<User>(`/users/${userId}`)
  },

  async getProfile(userId: string): Promise<ProfileResponse> {
    return apiClient.get<ProfileResponse>(`/users/${userId}/profile`)
  },

  async update(userId: string, data: UpdateUserInput): Promise<User> {
    return apiClient.put<User>(`/users/${userId}`, data)
  },
}
