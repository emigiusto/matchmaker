/**
 * Phone number normalization for storage and lookup.
 * One phone number (in any format) should map to exactly one User.
 * Use this when: creating users, finding users by phone, adding candidates.
 */

/**
 * Normalize phone to canonical storage format (digits only).
 * Enables matching "34600972124", "+34 600 972 124", "34-600-972-124", etc.
 */
export function normalizePhoneToCanonical(phone: string | null | undefined): string {
  if (!phone || typeof phone !== 'string') return '';
  const digits = phone.replace(/\D/g, '');
  return digits.startsWith('0') ? digits.slice(1) : digits;
}
