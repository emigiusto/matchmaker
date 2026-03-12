/**
 * Phone validation and formatting per E.164 (ITU-T).
 * E.164: + prefix, digits only, 8–15 digits total.
 */

/** E.164: 8–15 digits after + */
const E164_MIN_DIGITS = 8;
const E164_MAX_DIGITS = 15;

/** Strip to digits only (no + or spaces) */
export function digitsOnly(phone: string): string {
  return (phone || '').replace(/\D/g, '');
}

/**
 * Validate E.164 format: must start with + and have 8–15 digits.
 * Accepts: +34612345678, +34 612 345 678, +1 415 555 1234
 */
export function validatePhoneE164(phone: string): { valid: boolean; error?: string } {
  const trimmed = (phone || '').trim();
  if (!trimmed) return { valid: false, error: 'Phone number is required' };
  if (!trimmed.startsWith('+')) return { valid: false, error: 'Phone must start with country code (e.g. +34)' };
  const digits = digitsOnly(trimmed);
  if (digits.length < E164_MIN_DIGITS) {
    return { valid: false, error: `Phone must have at least ${E164_MIN_DIGITS} digits` };
  }
  if (digits.length > E164_MAX_DIGITS) {
    return { valid: false, error: `Phone cannot exceed ${E164_MAX_DIGITS} digits` };
  }
  return { valid: true };
}

/** Format display: +34 612 345 678 (keeps +, groups digits) */
export function formatPhoneForDisplay(phone: string): string {
  const d = digitsOnly(phone);
  if (d.length < 4) return d ? `+${d}` : '';
  const cc = d.slice(0, Math.min(3, d.length - 4));
  const rest = d.slice(cc.length);
  const grouped = rest.replace(/(\d{3})(?=\d)/g, '$1 ');
  return `+${cc} ${grouped}`.trim();
}

/** Normalize to E.164 storage format: +XXXXXXXXX */
export function toE164(phone: string, defaultCountryCode?: string): string {
  const d = digitsOnly(phone);
  if (!d) return '';
  if (d.startsWith('0')) {
    const withoutZero = d.slice(1);
    const cc = defaultCountryCode || '34';
    return `+${cc}${withoutZero}`;
  }
  if (!phone.trim().startsWith('+') && defaultCountryCode) {
    return `+${defaultCountryCode}${d}`;
  }
  return `+${d}`;
}

/** URL for SVG flag (3:2 ratio). Use for reliable cross-platform display. */
const FLAG_CDN = "https://catamphetamine.gitlab.io/country-flag-icons/3x2";

export function getFlagUrl(iso: string): string {
  if (!iso || iso.length !== 2 || iso === "OT") return ""
  return `${FLAG_CDN}/${iso}.svg`
}

/** Common country codes for UI selector. Ordered: Spain context first. */
export const COUNTRY_CODES: { code: string; dial: string; name: string }[] = [
  // Spain & neighbours
  { code: "ES", dial: "34", name: "Spain" },
  { code: "PT", dial: "351", name: "Portugal" },
  { code: "FR", dial: "33", name: "France" },
  { code: "AD", dial: "376", name: "Andorra" },
  // Western Europe
  { code: "GB", dial: "44", name: "UK" },
  { code: "DE", dial: "49", name: "Germany" },
  { code: "IT", dial: "39", name: "Italy" },
  { code: "NL", dial: "31", name: "Netherlands" },
  { code: "BE", dial: "32", name: "Belgium" },
  { code: "CH", dial: "41", name: "Switzerland" },
  { code: "AT", dial: "43", name: "Austria" },
  { code: "IE", dial: "353", name: "Ireland" },
  // Americas
  { code: "US", dial: "1", name: "USA" },
  { code: "MX", dial: "52", name: "Mexico" },
  { code: "AR", dial: "54", name: "Argentina" },
  { code: "CO", dial: "57", name: "Colombia" },
  { code: "CL", dial: "56", name: "Chile" },
  { code: "PE", dial: "51", name: "Peru" },
  { code: "VE", dial: "58", name: "Venezuela" },
  { code: "EC", dial: "593", name: "Ecuador" },
  { code: "GT", dial: "502", name: "Guatemala" },
  { code: "CU", dial: "53", name: "Cuba" },
  { code: "BO", dial: "591", name: "Bolivia" },
  { code: "HN", dial: "504", name: "Honduras" },
  { code: "PY", dial: "595", name: "Paraguay" },
  { code: "SV", dial: "503", name: "El Salvador" },
  { code: "NI", dial: "505", name: "Nicaragua" },
  { code: "CR", dial: "506", name: "Costa Rica" },
  { code: "PA", dial: "507", name: "Panama" },
  { code: "UY", dial: "598", name: "Uruguay" },
  { code: "BR", dial: "55", name: "Brazil" },
  // Other Europe
  { code: "PL", dial: "48", name: "Poland" },
  { code: "RO", dial: "40", name: "Romania" },
  { code: "CZ", dial: "420", name: "Czech Republic" },
  { code: "GR", dial: "30", name: "Greece" },
  { code: "SE", dial: "46", name: "Sweden" },
  { code: "HU", dial: "36", name: "Hungary" },
  { code: "RU", dial: "7", name: "Russia" },
  // Africa & Asia
  { code: "MA", dial: "212", name: "Morocco" },
  { code: "CN", dial: "86", name: "China" },
  { code: "IN", dial: "91", name: "India" },
  { code: "JP", dial: "81", name: "Japan" },
  { code: "PH", dial: "63", name: "Philippines" },
  { code: "ZA", dial: "27", name: "South Africa" },
  { code: "TR", dial: "90", name: "Turkey" },
  { code: "EG", dial: "20", name: "Egypt" },
  { code: "NG", dial: "234", name: "Nigeria" },
  { code: "PK", dial: "92", name: "Pakistan" },
  { code: "BD", dial: "880", name: "Bangladesh" },
  { code: "AU", dial: "61", name: "Australia" },
  { code: "OT", dial: "", name: "Other" },
];

export function getCountryByDial(dial: string) {
  return COUNTRY_CODES.find((c) => c.dial === dial) ?? COUNTRY_CODES[COUNTRY_CODES.length - 1];
}

/** Find country code by matching longest prefix (598 before 59 before 5) */
export function parseCountryCode(digits: string): { dial: string; national: string } | null {
  if (!digits) return null;
  const sorted = [...COUNTRY_CODES].filter((c) => c.dial).sort((a, b) => b.dial.length - a.dial.length);
  for (const c of sorted) {
    if (digits === c.dial) return { dial: c.dial, national: "" };
    if (digits.startsWith(c.dial) && digits.length > c.dial.length) {
      return { dial: c.dial, national: digits.slice(c.dial.length).replace(/^0+/, "") };
    }
  }
  return null;
}
