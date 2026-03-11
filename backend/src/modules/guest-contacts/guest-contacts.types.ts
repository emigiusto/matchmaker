// guest-contacts.types.ts
// API-facing types for GuestContact (manual name+phone contacts)

export interface GuestContactDTO {
  id: string;
  ownerUserId: string;
  name: string;
  phone: string;
  createdAt: string;
}

/** Response when creating a manual contact: GuestContact + User (for priority list / scheduling) */
export interface CreateGuestContactResultDTO {
  guestContact: GuestContactDTO;
  user: { id: string; name: string | null };
}

/** Input for ensureUserByPhone (when adding existing GuestContact to invite list) */
export interface EnsureUserByPhoneInput {
  phone: string;
  name: string;
}

/** Response: User found or created by phone */
export interface EnsureUserByPhoneResultDTO {
  user: { id: string; name: string | null };
}

export interface CreateGuestContactInput {
  ownerUserId: string;
  name: string;
  phone: string;
}
