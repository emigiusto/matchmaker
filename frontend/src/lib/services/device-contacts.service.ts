/**
 * Device contacts via Capacitor.
 * Only active when running inside the native Android/iOS shell.
 * On the web this module is safely imported but all methods are no-ops.
 */
import { Capacitor } from '@capacitor/core';
import { toE164 } from '@/lib/phone.utils';

export interface DeviceContact {
  /** Native contact ID */
  id: string;
  name: string;
  /** Phone numbers already normalised to E.164 */
  phones: string[];
}

function extractErrorMessage(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (e && typeof e === 'object') {
    const obj = e as Record<string, unknown>;
    return String(obj.message ?? obj.code ?? obj.errorMessage ?? JSON.stringify(e));
  }
  return String(e);
}

export const deviceContactsService = {
  isNative(): boolean {
    return Capacitor.isNativePlatform();
  },

  async requestPermission(): Promise<'granted' | 'denied'> {
    if (!this.isNative()) return 'denied';
    const { Contacts } = await import('@capacitor-community/contacts');
    console.log('[contacts] checking permissions');
    const check = await Contacts.checkPermissions();
    console.log('[contacts] checkPermissions result:', JSON.stringify(check));
    if (check.contacts === 'granted') return 'granted';
    console.log('[contacts] requesting permissions');
    const request = await Contacts.requestPermissions();
    console.log('[contacts] requestPermissions result:', JSON.stringify(request));
    const status = request.contacts;
    return status === 'granted' || status === 'limited' ? 'granted' : 'denied';
  },

  async getContacts(): Promise<DeviceContact[]> {
    if (!this.isNative()) return [];
    const { Contacts } = await import('@capacitor-community/contacts');
    console.log('[contacts] calling getContacts');
    const { contacts } = await Contacts.getContacts({
      projection: { name: true, phones: true },
    });
    console.log('[contacts] got', contacts.length, 'contacts');
    return contacts
      .map((c) => ({
        id: c.contactId ?? '',
        name: c.name?.display ?? c.name?.given ?? 'Unknown',
        phones: (c.phones ?? [])
          .map((p) => toE164((p.number ?? '').trim(), '34'))
          .filter(Boolean),
      }))
      .filter((c) => c.phones.length > 0);
  },

  extractErrorMessage,
};
