// contacts.types.ts
// API-facing types for the unified contacts system

export interface ContactDTO {
  id: string;
  ownerUserId: string;
  name: string;
  phone: string;
  socioNumbers: Record<string, string>; // clubSlug → socioNumber
  linkedUserId: string | null;
  linkedUserName: string | null;
  linkedUserIsGuest: boolean | null;
  importSource: string | null;
  communicationLanguage: string; // "es" | "en"
  createdAt: string;
  updatedAt: string;
}

export interface ContactListDTO {
  id: string;
  ownerUserId: string;
  name: string;
  createdAt: string;
  members: ContactDTO[];
}

export interface CreateContactInput {
  ownerUserId: string;
  name: string;
  phone: string;
  importSource?: string;
  externalId?: string;
  communicationLanguage?: string;
}

export interface UpdateContactInput {
  name?: string;
  socioNumbers?: Record<string, string>;
  communicationLanguage?: string;
}

/** Response when creating a contact: contact + resolved User for scheduling */
export interface CreateContactResultDTO {
  contact: ContactDTO;
  user: { id: string; name: string | null };
}
