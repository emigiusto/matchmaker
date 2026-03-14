import { apiClient } from "./api-client"

export interface GuestContactDTO {
  id: string
  ownerUserId: string
  name: string
  phone: string
  socioNumber?: string
  createdAt: string
}

export interface CreateGuestContactResult {
  guestContact: GuestContactDTO
  user: { id: string; name: string | null }
}

export const guestContactsService = {
  async create(ownerUserId: string, name: string, phone: string): Promise<CreateGuestContactResult> {
    return apiClient.post<CreateGuestContactResult>("/guest-contacts", {
      ownerUserId,
      name,
      phone,
    })
  },

  async listByOwner(ownerUserId: string): Promise<GuestContactDTO[]> {
    return apiClient.get<GuestContactDTO[]>("/guest-contacts", {
      ownerUserId,
    })
  },

  async ensureUserByPhone(phone: string, name: string): Promise<{ user: { id: string; name: string | null } }> {
    return apiClient.post("/guest-contacts/ensure-user", { phone, name })
  },

  async updateSocioNumber(id: string, ownerUserId: string, socioNumber: string): Promise<GuestContactDTO> {
    return apiClient.patch<GuestContactDTO>(`/guest-contacts/${id}/socio-number`, { ownerUserId, socioNumber })
  },
}
