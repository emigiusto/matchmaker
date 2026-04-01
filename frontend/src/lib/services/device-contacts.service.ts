/**
 * Device contacts service – Capacitor native contact access.
 *
 * This is separate from contacts.service.ts which manages backend app contacts.
 * This service reads contacts from the user's phone (iOS/Android) via Capacitor.
 *
 * Only functional on native platforms; all methods gracefully no-op on web.
 */

import { Capacitor } from "@capacitor/core"
import { toE164 } from "@/lib/phone.utils"

export interface DeviceContact {
  /** Native contact ID */
  id: string
  /** Display name from the device */
  name: string
  /** Phone numbers normalized to E.164 format */
  phones: string[]
}

export const deviceContactsService = {
  /** True when running inside the native iOS/Android shell */
  isNative(): boolean {
    return Capacitor.isNativePlatform()
  },

  /** Request contact-read permission. Returns 'granted' or 'denied'. */
  async requestPermission(): Promise<"granted" | "denied"> {
    if (!this.isNative()) return "denied"
    const { Contacts } = await import("@capacitor-community/contacts")
    const result = await Contacts.requestPermissions()
    return result.contacts === "granted" || result.contacts === "limited"
      ? "granted"
      : "denied"
  },

  /** Fetch all device contacts that have at least one phone number. */
  async getContacts(defaultCountryCode = "34"): Promise<DeviceContact[]> {
    if (!this.isNative()) return []
    const { Contacts } = await import("@capacitor-community/contacts")
    const { contacts } = await Contacts.getContacts({
      projection: { name: true, phones: true },
    })

    return contacts
      .map((c) => ({
        id: c.contactId ?? "",
        name: c.name?.display ?? c.name?.given ?? "Unknown",
        phones: (c.phones ?? [])
          .map((p) => toE164((p.number ?? "").trim(), defaultCountryCode))
          .filter(Boolean),
      }))
      .filter((c) => c.phones.length > 0)
  },
}
