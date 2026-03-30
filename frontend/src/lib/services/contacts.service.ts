// contacts.service.ts
// Unified contacts + contact lists service

import { apiClient } from "./api-client"

export interface ContactDTO {
  id: string
  ownerUserId: string
  name: string
  phone: string
  socioNumbers: Record<string, string> // clubSlug → socioNumber
  linkedUserId: string | null
  linkedUserName: string | null
  linkedUserIsGuest: boolean | null
  importSource: string | null
  communicationLanguage: string // "es" | "en"
  createdAt: string
  updatedAt: string
}

export interface ContactListDTO {
  id: string
  ownerUserId: string
  name: string
  createdAt: string
  members: ContactDTO[]
}

export interface CreateContactResult {
  contact: ContactDTO
  user: { id: string; name: string | null }
}

export const contactsService = {
  // ─── Contacts ──────────────────────────────────────────────

  async create(
    ownerUserId: string,
    name: string,
    phone: string,
    communicationLanguage?: string,
  ): Promise<CreateContactResult> {
    return apiClient.post<CreateContactResult>("/contacts", {
      ownerUserId,
      name,
      phone,
      importSource: "manual",
      ...(communicationLanguage ? { communicationLanguage } : {}),
    })
  },

  async list(ownerUserId: string): Promise<ContactDTO[]> {
    return apiClient.get<ContactDTO[]>("/contacts", { ownerUserId })
  },

  async updateSocioNumber(
    id: string,
    ownerUserId: string,
    currentSocioNumbers: Record<string, string>,
    clubSlug: string,
    socioNumber: string,
  ): Promise<ContactDTO> {
    const socioNumbers = { ...currentSocioNumbers, [clubSlug]: socioNumber }
    return apiClient.patch<ContactDTO>(`/contacts/${id}`, { ownerUserId, socioNumbers })
  },

  async delete(id: string, ownerUserId: string): Promise<void> {
    return apiClient.delete(`/contacts/${id}?ownerUserId=${encodeURIComponent(ownerUserId)}`)
  },

  async updateName(id: string, ownerUserId: string, name: string): Promise<ContactDTO> {
    return apiClient.patch<ContactDTO>(`/contacts/${id}`, { ownerUserId, name })
  },

  // ─── Contact Lists ─────────────────────────────────────────

  async listLists(ownerUserId: string): Promise<ContactListDTO[]> {
    return apiClient.get<ContactListDTO[]>("/contacts/lists", { ownerUserId })
  },

  async createList(ownerUserId: string, name: string): Promise<ContactListDTO> {
    return apiClient.post<ContactListDTO>("/contacts/lists", { ownerUserId, name })
  },

  async renameList(id: string, ownerUserId: string, name: string): Promise<ContactListDTO> {
    return apiClient.patch<ContactListDTO>(`/contacts/lists/${id}`, { ownerUserId, name })
  },

  async deleteList(id: string, ownerUserId: string): Promise<void> {
    return apiClient.delete(`/contacts/lists/${id}?ownerUserId=${encodeURIComponent(ownerUserId)}`)
  },

  async addMemberToList(
    listId: string,
    contactId: string,
    ownerUserId: string,
  ): Promise<ContactListDTO> {
    return apiClient.post<ContactListDTO>(`/contacts/lists/${listId}/members`, {
      ownerUserId,
      contactId,
    })
  },

  async removeMemberFromList(
    listId: string,
    contactId: string,
    ownerUserId: string,
  ): Promise<void> {
    return apiClient.delete(
      `/contacts/lists/${listId}/members/${contactId}?ownerUserId=${encodeURIComponent(ownerUserId)}`,
    )
  },
}
